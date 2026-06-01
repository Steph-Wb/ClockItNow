import { Router, Request, Response } from 'express';
import { db } from '../database.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

router.get('/', (req: Request, res: Response) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  const rows = db.prepare(
    'SELECT * FROM tasks WHERE project_id = ? AND user_id = ? AND is_active = 1 ORDER BY name'
  ).all(Number(projectId), uid(req));
  res.json(rows);
});

router.post('/', (req: Request, res: Response) => {
  const { name, project_id } = req.body;
  if (!name || !project_id) return res.status(400).json({ error: 'name and project_id required' });
  const result = db.prepare(
    'INSERT INTO tasks (name, project_id, user_id) VALUES (?, ?, ?)'
  ).run(name, Number(project_id), uid(req));
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(Number(id), uid(req)) as any;
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name, is_active } = req.body;
  db.prepare('UPDATE tasks SET name = ?, is_active = ? WHERE id = ? AND user_id = ?').run(
    name ?? existing.name,
    is_active !== undefined ? Number(is_active) : existing.is_active,
    Number(id), uid(req)
  );
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(id)));
});

router.delete('/:id', (req: Request, res: Response) => {
  db.prepare('UPDATE tasks SET is_active = 0 WHERE id = ? AND user_id = ?').run(Number(req.params.id), uid(req));
  res.json({ success: true });
});

export default router;
