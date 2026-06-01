import { Router, Request, Response } from 'express';
import { db } from '../database.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

router.get('/', (req: Request, res: Response) => {
  const row = db.prepare('SELECT sender_name, sender_address, signature_png FROM app_settings WHERE user_id = ?').get(uid(req));
  res.json(row ?? { sender_name: null, sender_address: null, signature_png: null });
});

router.put('/', (req: Request, res: Response) => {
  const { sender_name, sender_address, signature_png } = req.body;
  db.prepare(`
    INSERT INTO app_settings (user_id, sender_name, sender_address, signature_png, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      sender_name = excluded.sender_name,
      sender_address = excluded.sender_address,
      signature_png = excluded.signature_png,
      updated_at = datetime('now')
  `).run(uid(req), sender_name ?? null, sender_address ?? null, signature_png ?? null);
  const row = db.prepare('SELECT sender_name, sender_address, signature_png FROM app_settings WHERE user_id = ?').get(uid(req));
  res.json(row);
});

export default router;
