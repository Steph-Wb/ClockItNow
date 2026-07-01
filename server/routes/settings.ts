import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { DEFAULT_TIMEZONE, isValidTimeZone } from '../lib/timezone.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

const SELECT_COLS = 'sender_name, sender_address, signature_png, timezone';

router.get('/', (req: Request, res: Response) => {
  const row = db.prepare(`SELECT ${SELECT_COLS} FROM app_settings WHERE user_id = ?`).get(uid(req));
  res.json(row ?? { sender_name: null, sender_address: null, signature_png: null, timezone: DEFAULT_TIMEZONE });
});

router.put('/', (req: Request, res: Response) => {
  const { sender_name, sender_address, signature_png, timezone } = req.body;
  const tz = timezone && isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
  db.prepare(`
    INSERT INTO app_settings (user_id, sender_name, sender_address, signature_png, timezone, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      sender_name = excluded.sender_name,
      sender_address = excluded.sender_address,
      signature_png = excluded.signature_png,
      timezone = excluded.timezone,
      updated_at = datetime('now')
  `).run(uid(req), sender_name ?? null, sender_address ?? null, signature_png ?? null, tz);
  const row = db.prepare(`SELECT ${SELECT_COLS} FROM app_settings WHERE user_id = ?`).get(uid(req));
  res.json(row);
});

export default router;
