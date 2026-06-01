import { Router, Request, Response } from 'express';
import { db } from '../database.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

router.get('/', (req: Request, res: Response) => {
  const active = req.query.active;
  let rows;
  if (active !== undefined) {
    rows = db.prepare('SELECT * FROM clients WHERE user_id = ? AND is_active = ? ORDER BY name').all(uid(req), Number(active));
  } else {
    rows = db.prepare('SELECT * FROM clients WHERE user_id = ? ORDER BY name').all(uid(req));
  }
  res.json(rows);
});

router.post('/', (req: Request, res: Response) => {
  const { name, address, street, zip_city, rapport_postfix, rapport_description, currency } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare(
    'INSERT INTO clients (name, address, street, zip_city, rapport_postfix, rapport_description, currency, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, address ?? null, street ?? null, zip_city ?? null,
    rapport_postfix != null && rapport_postfix !== '' ? Number(rapport_postfix) : null,
    rapport_description ?? null, currency ?? 'CHF', uid(req));
  res.status(201).json(db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req: Request, res: Response) => {
  const { name, address, street, zip_city, rapport_postfix, rapport_description, currency, is_active } = req.body;
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM clients WHERE id = ? AND user_id = ?').get(Number(id), uid(req)) as any;
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE clients SET name = ?, address = ?, street = ?, zip_city = ?, rapport_postfix = ?, rapport_description = ?, currency = ?, is_active = ? WHERE id = ? AND user_id = ?').run(
    name ?? existing.name,
    address !== undefined ? address : existing.address,
    street !== undefined ? street : existing.street,
    zip_city !== undefined ? zip_city : existing.zip_city,
    rapport_postfix !== undefined ? (rapport_postfix === null || rapport_postfix === '' ? null : Number(rapport_postfix)) : existing.rapport_postfix,
    rapport_description !== undefined ? rapport_description : existing.rapport_description,
    currency ?? existing.currency,
    is_active !== undefined ? Number(is_active) : existing.is_active,
    Number(id), uid(req)
  );
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(id)));
});

router.delete('/:id', (req: Request, res: Response) => {
  db.prepare('UPDATE clients SET is_active = 0 WHERE id = ? AND user_id = ?').run(Number(req.params.id), uid(req));
  res.json({ success: true });
});

export default router;
