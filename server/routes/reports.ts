import { Router, Request, Response } from 'express';
import { db } from '../database.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const { from, to, clientIds, projectIds, billable, groupBy = 'project' } = req.query;
  const userId = (req as any).user.id as number;

  let sql = `
    SELECT
      te.id, te.description, te.start_time, te.end_time, te.is_billable,
      p.id as project_id, p.name as project_name, p.color as project_color,
      p.hourly_rate,
      c.id as client_id, c.name as client_name, c.currency
    FROM time_entries te
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE te.user_id = ? AND te.end_time IS NOT NULL
  `;
  const params: unknown[] = [userId];

  if (from) { sql += ' AND te.start_time >= ?'; params.push(new Date(from as string).toISOString()); }
  if (to) {
    const endDate = new Date(to as string);
    endDate.setHours(23, 59, 59, 999);
    sql += ' AND te.start_time <= ?';
    params.push(endDate.toISOString());
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

  sql += ' ORDER BY te.start_time ASC';

  const rows = db.prepare(sql).all(...params) as any[];

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
