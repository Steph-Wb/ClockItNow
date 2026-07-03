import { Router, Request, Response } from 'express';
import { db } from '../database.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

router.get('/', (req: Request, res: Response) => {
  const { clientId, active } = req.query;
  let sql = `
    SELECT p.*, c.name as client_name
    FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE p.user_id = ?
  `;
  const params: (string | number)[] = [uid(req)];
  if (clientId) { sql += ' AND p.client_id = ?'; params.push(Number(clientId)); }
  if (active !== undefined) { sql += ' AND p.is_active = ?'; params.push(Number(active)); }
  sql += ' ORDER BY p.name';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req: Request, res: Response) => {
  const { name, client_id, color, hourly_rate, is_billable } = req.body;
  if (!name) return res.status(400).json({ error: 'errors.nameRequired' });
  const result = db.prepare(
    'INSERT INTO projects (name, client_id, color, hourly_rate, is_billable, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, client_id ?? null, color ?? '#00BCD4', hourly_rate ?? 0, is_billable !== undefined ? Number(is_billable) : 1, uid(req));
  const row = db.prepare(`
    SELECT p.*, c.name as client_name FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id WHERE p.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(Number(id), uid(req)) as any;
  if (!existing) return res.status(404).json({ error: 'errors.notFound' });
  const { name, client_id, color, hourly_rate, is_billable, is_active } = req.body;
  db.prepare(
    'UPDATE projects SET name=?, client_id=?, color=?, hourly_rate=?, is_billable=?, is_active=? WHERE id=? AND user_id=?'
  ).run(
    name ?? existing.name,
    client_id !== undefined ? (client_id === null ? null : Number(client_id)) : existing.client_id,
    color ?? existing.color,
    hourly_rate !== undefined ? Number(hourly_rate) : existing.hourly_rate,
    is_billable !== undefined ? Number(is_billable) : existing.is_billable,
    is_active !== undefined ? Number(is_active) : existing.is_active,
    Number(id), uid(req)
  );
  const row = db.prepare(`
    SELECT p.*, c.name as client_name FROM projects p
    LEFT JOIN clients c ON p.client_id = c.id WHERE p.id = ?
  `).get(Number(id));
  res.json(row);
});

router.delete('/:id', (req: Request, res: Response) => {
  db.prepare('UPDATE projects SET is_active = 0 WHERE id = ? AND user_id = ?').run(Number(req.params.id), uid(req));
  res.json({ success: true });
});

export default router;
