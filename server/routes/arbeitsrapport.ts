import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { buildArbeitsrapportWorkbook } from '../lib/buildArbeitsrapport.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

/** Zeiteinträge eines Kunden im Zeitraum laden (Muster aus reports.ts) */
function loadEntries(userId: number, from: string, to: string, clientId: number, includeBilled: boolean) {
  const endDate = new Date(to);
  endDate.setHours(23, 59, 59, 999);
  return db.prepare(`
    SELECT te.id, te.description, te.start_time, te.end_time, te.billed_at, p.name as project_name
    FROM time_entries te
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE te.user_id = ? AND te.end_time IS NOT NULL
      AND te.start_time >= ? AND te.start_time <= ?
      AND c.id = ?
      ${includeBilled ? '' : 'AND te.billed_at IS NULL'}
    ORDER BY te.start_time ASC
  `).all(userId, new Date(from).toISOString(), endDate.toISOString(), clientId) as any[];
}

router.get('/', async (req: Request, res: Response) => {
  const { from, to, clientId, projektText, rapportNr, lang, includeBilled } = req.query;
  if (!from || !to || !clientId) {
    return res.status(400).json({ error: 'errors.arbeitsrapport.paramsRequired' });
  }
  const userId = uid(req);
  const withBilled = includeBilled === 'true' || includeBilled === '1';

  const client = db.prepare('SELECT name, street, zip_city, rapport_postfix, rapport_description FROM clients WHERE id = ? AND user_id = ?')
    .get(Number(clientId), userId) as any;
  if (!client) return res.status(404).json({ error: 'errors.arbeitsrapport.clientNotFound' });

  const settings = db.prepare('SELECT sender_name, sender_address, signature_png FROM app_settings WHERE user_id = ?')
    .get(userId) as any ?? {};

  const entries = loadEntries(userId, from as string, to as string, Number(clientId), withBilled);

  // Rapport-Nr. aus 'to' ableiten; Datum = Erstellungsdatum (heute)
  const toDate = new Date(to as string);
  const yyyymm = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}`;
  const now = new Date();
  const datum = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  const postfix = client.rapport_postfix != null ? `.${String(client.rapport_postfix).padStart(2, '0')}` : '';
  const nr = (rapportNr as string) || `${yyyymm}${postfix}`;

  const wb = buildArbeitsrapportWorkbook({
    entries,
    client: { name: client.name, street: client.street, zip_city: client.zip_city },
    sender: { name: settings.sender_name, address: settings.sender_address },
    signaturePngBase64: settings.signature_png,
    projektText: (projektText as string) || client.rapport_description || '',
    rapportNr: nr,
    datum,
    lang: (lang === 'en' ? 'en' : 'de'),
  });

  // Die in diesen Rapport eingeflossenen, noch offenen Einträge als rapportiert markieren.
  const toMark = entries.filter(e => !e.billed_at).map(e => e.id as number);
  if (toMark.length) {
    const stmt = db.prepare(`UPDATE time_entries SET billed_at = datetime('now') WHERE id = ? AND user_id = ?`);
    for (const id of toMark) stmt.run(id, userId);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const senderPart = settings.sender_name ? ` ${settings.sender_name}` : '';
  const filename = `Arbeitsrapport-${nr}${senderPart}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

export default router;
