/**
 * CLI: Arbeitsrapport als .xlsx aus der ClockItNow-Datenbank erzeugen.
 *
 *   npx tsx scripts/arbeitsrapport.ts --month 2026-01 --client "Muster AG" \
 *       [--projekt "Diverse Aufträge ..."] [--out <Pfad oder Ordner>]
 *
 * Liest node:sqlite direkt (kein Auth) und nutzt denselben Builder wie der
 * App-Endpoint (server/lib/buildArbeitsrapport.ts).
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildArbeitsrapportWorkbook } from '../server/lib/buildArbeitsrapport.js';
import { DEFAULT_TIMEZONE, isValidTimeZone, localDateKey, utcWindowForLocalRange } from '../server/lib/timezone.js';
import { normalizeRoundingRule } from '../server/lib/rounding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'clockitnow.db');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const month = arg('month');         // YYYY-MM
const clientName = arg('client');
const projektArg = arg('projekt');
const outArg = arg('out');

if (!month || !/^\d{4}-\d{2}$/.test(month) || !clientName) {
  console.error('Usage: tsx scripts/arbeitsrapport.ts --month YYYY-MM --client "<Name>" [--projekt "..."] [--out <Pfad>]');
  process.exit(1);
}

const [year, mon] = month.split('-').map(Number);
if (mon < 1 || mon > 12) {
  console.error(`Ungültiger Monat: ${month} (erwartet YYYY-MM mit Monat 01–12)`);
  process.exit(1);
}

// Lokaler Kalenderbereich des Monats; die exakte Tagesgrenze wird unten
// in der Zeitzone des Users gezogen (gleiche Logik wie server/routes/arbeitsrapport.ts)
const fromKey = `${month}-01`;
const toKey = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10); // letzter Tag des Monats

const db = new DatabaseSync(DB_PATH);

const client = db.prepare('SELECT id, name, street, zip_city, rapport_postfix, rapport_description, rounding_step, rounding_mode, user_id FROM clients WHERE name = ? COLLATE NOCASE')
  .get(clientName) as any;
if (!client) {
  console.error(`Kunde "${clientName}" nicht gefunden.`);
  process.exit(1);
}

const settings = db.prepare('SELECT sender_name, sender_address, signature_png, timezone FROM app_settings WHERE user_id = ?')
  .get(client.user_id) as any ?? {};
const tz = settings.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : DEFAULT_TIMEZONE;

// Erstellungsdatum in der Zeitzone des Users (wie der App-Endpoint)
const [ty, tm, td] = localDateKey(new Date().toISOString(), tz).split('-');
const datum = `${td}.${tm}.${ty}`;

// SQL großzügig in UTC vorfiltern, dann exakte Monatsgrenze in der User-TZ ziehen
const { start, end } = utcWindowForLocalRange(fromKey, toKey);
const entries = (db.prepare(`
  SELECT te.description, te.start_time, te.end_time, p.name as project_name
  FROM time_entries te
  LEFT JOIN projects p ON te.project_id = p.id
  LEFT JOIN clients c ON p.client_id = c.id
  WHERE te.end_time IS NOT NULL
    AND te.start_time >= ? AND te.start_time <= ?
    AND c.id = ?
  ORDER BY te.start_time ASC
`).all(start, end, client.id) as any[]).filter(r => {
  const k = localDateKey(r.start_time, tz);
  return k >= fromKey && k <= toKey;
});

const postfix = client.rapport_postfix != null ? `.${String(client.rapport_postfix).padStart(2, '0')}` : '';
const rapportNr = `${month}${postfix}`;

const wb = buildArbeitsrapportWorkbook({
  entries,
  client: { name: client.name, street: client.street, zip_city: client.zip_city },
  sender: { name: settings.sender_name, address: settings.sender_address },
  signaturePngBase64: settings.signature_png,
  projektText: projektArg || client.rapport_description || '',
  rapportNr,
  datum,
  tz,
  rounding: normalizeRoundingRule(client.rounding_step, client.rounding_mode),
});

const senderPart = settings.sender_name ? ` ${settings.sender_name}` : '';
const filename = `Arbeitsrapport-${rapportNr}${senderPart}.xlsx`;
let outPath = outArg ?? filename;
if (outArg && fs.existsSync(outArg) && fs.statSync(outArg).isDirectory()) {
  outPath = path.join(outArg, filename);
}

await wb.xlsx.writeFile(outPath);
console.log(`Arbeitsrapport erstellt: ${path.resolve(outPath)} (${entries.length} Einträge)`);
