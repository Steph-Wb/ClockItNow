import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { buildArbeitsrapportWorkbook } from '../lib/buildArbeitsrapport.js';
import { getUserTimezone, localDateKey, utcWindowForLocalRange, parseDateKey } from '../lib/timezone.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

/** Zeiteinträge eines Kunden im Zeitraum laden (gleiche Filter-Logik wie reports.ts) */
function loadEntries(
  userId: number,
  from: string,
  to: string,
  clientId: number,
  projectIds: number[],
  billable: string,
  billed: string,
  tz: string,
) {
  let sql = `
    SELECT te.id, te.description, te.start_time, te.end_time, te.billed_at, p.name as project_name
    FROM time_entries te
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE te.user_id = ? AND te.end_time IS NOT NULL AND c.id = ?
  `;
  const params: unknown[] = [userId, clientId];

  const { start, end } = utcWindowForLocalRange(from, to);
  sql += ' AND te.start_time >= ? AND te.start_time <= ?';
  params.push(start, end);

  if (projectIds.length) {
    sql += ` AND p.id IN (${projectIds.map(() => '?').join(',')})`;
    params.push(...projectIds);
  }

  if (billable === 'billable') sql += ' AND te.is_billable = 1';
  else if (billable === 'non_billable') sql += ' AND te.is_billable = 0';

  if (billed === 'billed') sql += ' AND te.billed_at IS NOT NULL';
  else if (billed === 'unbilled') sql += ' AND te.billed_at IS NULL';

  sql += ' ORDER BY te.start_time ASC';

  const allRows = db.prepare(sql).all(...params) as any[];

  // Exakte Tagesgrenze in der Zeitzone des Users ziehen (das UTC-Fenster oben ist absichtlich weiter).
  return allRows.filter(r => {
    const k = localDateKey(r.start_time, tz);
    return k >= from && k <= to;
  });
}

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { from, to, clientId, projektText, rapportNr, lang, projectIds, billable, billed } = req.query;
  if (!from || !to || !clientId) {
    return res.status(400).json({ error: 'errors.arbeitsrapport.paramsRequired' });
  }
  if (!parseDateKey(from) || !parseDateKey(to)) {
    return res.status(400).json({ error: 'errors.arbeitsrapport.invalidDateRange' });
  }
  const userId = uid(req);
  const tz = getUserTimezone(userId);

  const client = db.prepare('SELECT name, street, zip_city, rapport_postfix, rapport_description FROM clients WHERE id = ? AND user_id = ?')
    .get(Number(clientId), userId) as any;
  if (!client) return res.status(404).json({ error: 'errors.arbeitsrapport.clientNotFound' });

  const settings = db.prepare('SELECT sender_name, sender_address, signature_png FROM app_settings WHERE user_id = ?')
    .get(userId) as any ?? {};

  const projectIdList = projectIds ? (projectIds as string).split(',').map(Number).filter(Boolean) : [];
  const entries = loadEntries(
    userId,
    from as string,
    to as string,
    Number(clientId),
    projectIdList,
    (billable as string) || 'all',
    (billed as string) || 'all',
    tz,
  );

  // Rapport-Nr. aus 'to' ableiten (Datumsstring direkt, ohne TZ-Drift); Datum = Erstellungsdatum (heute, in User-TZ)
  const yyyymm = (to as string).slice(0, 7); // 'YYYY-MM'
  const [ty, tm, td] = localDateKey(new Date().toISOString(), tz).split('-');
  const datum = `${td}.${tm}.${ty}`;

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

  const buffer = await wb.xlsx.writeBuffer();

  const senderPart = settings.sender_name ? ` ${settings.sender_name}` : '';
  // Steuer- und Anführungszeichen entfernen, sonst wirft res.setHeader
  const filename = `Arbeitsrapport-${nr}${senderPart}.xlsx`.replace(/["\\\r\n\t]|[\x00-\x1f]/g, '');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}));

/**
 * Bestätigungs-Endpoint: markiert die Einträge eines Rapports als rapportiert.
 * Wird vom Frontend erst NACH erfolgreichem Empfang der Datei aufgerufen –
 * der GET-Download selbst verändert keinen Zustand mehr (Prefetch/Retry-sicher).
 * Gleiche Filter wie der Download, damit exakt dieselben Einträge markiert werden.
 */
router.post('/mark-billed', (req: Request, res: Response) => {
  const { from, to, clientId, projectIds, billable, billed } = req.body;
  if (!from || !to || !clientId) {
    return res.status(400).json({ error: 'errors.arbeitsrapport.paramsRequired' });
  }
  if (!parseDateKey(from) || !parseDateKey(to)) {
    return res.status(400).json({ error: 'errors.arbeitsrapport.invalidDateRange' });
  }
  const userId = uid(req);
  const tz = getUserTimezone(userId);

  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(Number(clientId), userId);
  if (!client) return res.status(404).json({ error: 'errors.arbeitsrapport.clientNotFound' });

  const projectIdList = Array.isArray(projectIds) ? projectIds.map(Number).filter(Boolean) : [];
  const entries = loadEntries(userId, from, to, Number(clientId), projectIdList, billable || 'all', billed || 'all', tz);

  const toMark = entries.filter(e => !e.billed_at).map(e => e.id as number);
  let marked = 0;
  if (toMark.length) {
    marked = db.prepare(
      `UPDATE time_entries SET billed_at = datetime('now')
       WHERE user_id = ? AND billed_at IS NULL AND id IN (${toMark.map(() => '?').join(',')})`
    ).run(userId, ...toMark).changes as number;
  }
  res.json({ marked });
});

export default router;
