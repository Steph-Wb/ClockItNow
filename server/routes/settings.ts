import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { DEFAULT_TIMEZONE, isValidTimeZone } from '../lib/timezone.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

const SELECT_COLS = 'sender_name, sender_address, signature_png, timezone, goal_amount, goal_period';
const GOAL_PERIODS = ['day', 'week', 'month'];

router.get('/', (req: Request, res: Response) => {
  const row = db.prepare(`SELECT ${SELECT_COLS} FROM app_settings WHERE user_id = ?`).get(uid(req));
  res.json(row ?? {
    sender_name: null, sender_address: null, signature_png: null,
    timezone: DEFAULT_TIMEZONE, goal_amount: null, goal_period: null,
  });
});

router.put('/', (req: Request, res: Response) => {
  // Partielles Update: fehlende Felder behalten den Bestand (z. B. setzt das
  // Dashboard nur das Ziel, die Settings-Seite nur die Absenderdaten)
  const existing = (db.prepare('SELECT * FROM app_settings WHERE user_id = ?').get(uid(req)) ?? {}) as Record<string, unknown>;
  const pick = (key: string) => (req.body[key] !== undefined ? req.body[key] : existing[key] ?? null);

  const tzRaw = pick('timezone');
  const tz = tzRaw && isValidTimeZone(tzRaw) ? tzRaw : DEFAULT_TIMEZONE;

  const amountRaw = pick('goal_amount');
  const goalAmount = typeof amountRaw === 'number' && isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;
  const periodRaw = pick('goal_period');
  const goalPeriod = goalAmount !== null && GOAL_PERIODS.includes(periodRaw) ? periodRaw : null;

  db.prepare(`
    INSERT INTO app_settings (user_id, sender_name, sender_address, signature_png, timezone, goal_amount, goal_period, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      sender_name = excluded.sender_name,
      sender_address = excluded.sender_address,
      signature_png = excluded.signature_png,
      timezone = excluded.timezone,
      goal_amount = excluded.goal_amount,
      goal_period = excluded.goal_period,
      updated_at = datetime('now')
  `).run(uid(req), pick('sender_name'), pick('sender_address'), pick('signature_png'), tz, goalAmount, goalPeriod);

  const row = db.prepare(`SELECT ${SELECT_COLS} FROM app_settings WHERE user_id = ?`).get(uid(req));
  res.json(row);
});

export default router;
