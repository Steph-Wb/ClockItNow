import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { getUserTimezone, localDateKey, utcWindowForLocalRange } from '../lib/timezone.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const { from, to, clientIds, projectIds, billable, billed, groupBy = 'project' } = req.query;
  const userId = (req as any).user.id as number;
  const tz = getUserTimezone(userId);

  let sql = `
    SELECT
      te.id, te.description, te.start_time, te.end_time, te.is_billable, te.billed_at,
      p.id as project_id, p.name as project_name, p.color as project_color,
      p.hourly_rate,
      c.id as client_id, c.name as client_name, c.currency
    FROM time_entries te
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE te.user_id = ? AND te.end_time IS NOT NULL
  `;
  const params: unknown[] = [userId];

  // SQL großzügig in UTC vorfiltern; die exakte lokale Tagesgrenze wird unten in JS gezogen.
  const fromKey = from as string | undefined;
  const toKey = to as string | undefined;
  if (fromKey && toKey) {
    const { start, end } = utcWindowForLocalRange(fromKey, toKey);
    sql += ' AND te.start_time >= ? AND te.start_time <= ?';
    params.push(start, end);
  } else {
    if (fromKey) { sql += ' AND te.start_time >= ?'; params.push(new Date(fromKey).toISOString()); }
    if (toKey)   { sql += ' AND te.start_time <= ?'; const e = new Date(toKey); e.setUTCHours(23,59,59,999); params.push(e.toISOString()); }
  }
  if (clientIds) {
    const ids = (clientIds as string).split(',').map(Number).filter(Boolean);
    if (ids.length) { sql += ` AND c.id IN (${ids.map(() => '?').join(',')})`;  params.push(...ids); }
  }
  if (projectIds) {
    const ids = (projectIds as string).split(',').map(Number).filter(Boolean);
    if (ids.length) { sql += ` AND p.id IN (${ids.map(() => '?').join(',')})`;  params.push(...ids); }
  }
  if (billable === 'billable') { sql += ' AND te.is_billable = 1'; }
  else if (billable === 'non_billable') { sql += ' AND te.is_billable = 0'; }

  if (billed === 'billed') { sql += ' AND te.billed_at IS NOT NULL'; }
  else if (billed === 'unbilled') { sql += ' AND te.billed_at IS NULL'; }

  sql += ' ORDER BY te.start_time ASC';

  const allRows = db.prepare(sql).all(...params) as any[];

  // Exakte Tagesgrenze in der Zeitzone des Users ziehen (das UTC-Fenster oben ist absichtlich weiter).
  const rows = (fromKey && toKey)
    ? allRows.filter(r => {
        const k = localDateKey(r.start_time, tz);
        return k >= fromKey && k <= toKey;
      })
    : allRows;

  let totalSeconds = 0;
  let totalAmount = 0;

  const enriched = rows.map(r => {
    const secs = (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 1000;
    const amount = r.is_billable && r.hourly_rate ? (secs / 3600) * r.hourly_rate : 0;
    totalSeconds += secs;
    totalAmount += amount;
    return { ...r, duration_seconds: secs, amount };
  });

  res.json({ entries: enriched, totalSeconds, totalAmount, groupBy });
});

export default router;
