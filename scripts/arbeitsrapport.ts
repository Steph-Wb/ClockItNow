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
const from = new Date(year, mon - 1, 1).toISOString();
const to = new Date(year, mon, 0, 23, 59, 59, 999).toISOString();
const now = new Date();                                       // Erstellungsdatum
const datum = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

const db = new DatabaseSync(DB_PATH);

const client = db.prepare('SELECT id, name, street, zip_city, rapport_postfix, rapport_description, user_id FROM clients WHERE name = ? COLLATE NOCASE')
  .get(clientName) as any;
if (!client) {
  console.error(`Kunde "${clientName}" nicht gefunden.`);
  process.exit(1);
}

const settings = db.prepare('SELECT sender_name, sender_address, signature_png FROM app_settings WHERE user_id = ?')
  .get(client.user_id) as any ?? {};

const entries = db.prepare(`
  SELECT te.description, te.start_time, te.end_time, p.name as project_name
  FROM time_entries te
  LEFT JOIN projects p ON te.project_id = p.id
  LEFT JOIN clients c ON p.client_id = c.id
  WHERE te.end_time IS NOT NULL
    AND te.start_time >= ? AND te.start_time <= ?
    AND c.id = ?
  ORDER BY te.start_time ASC
`).all(from, to, client.id) as any[];

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
});

const senderPart = settings.sender_name ? ` ${settings.sender_name}` : '';
const filename = `Arbeitsrapport-${rapportNr}${senderPart}.xlsx`;
let outPath = outArg ?? filename;
if (outArg && fs.existsSync(outArg) && fs.statSync(outArg).isDirectory()) {
  outPath = path.join(outArg, filename);
}

await wb.xlsx.writeFile(outPath);
console.log(`Arbeitsrapport erstellt: ${path.resolve(outPath)} (${entries.length} Einträge)`);
