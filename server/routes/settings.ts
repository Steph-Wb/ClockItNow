import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { DEFAULT_TIMEZONE, isValidTimeZone } from '../lib/timezone.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

const SELECT_COLS =
  'sender_name, sender_address, signature_png, timezone, goal_amount, goal_period, ' +
  'ui_lang, work_days, work_start, work_end, long_timer_hours, idle_minutes, backup_dir, backup_keep';

const GOAL_PERIODS = ['day', 'week', 'month'];
const UI_LANGS = ['de', 'en'];

const DEFAULTS = {
  sender_name: null, sender_address: null, signature_png: null,
  timezone: DEFAULT_TIMEZONE, goal_amount: null, goal_period: null,
  ui_lang: null, work_days: '1,2,3,4,5', work_start: 9, work_end: 17,
  long_timer_hours: 4, idle_minutes: 10, backup_dir: null, backup_keep: 14,
};

/** Zahl im Bereich, sonst Fallback */
function numIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** CSV aus Wochentagen 1–7 (Mo–So), dedupliziert + sortiert; sonst Fallback */
function normalizeWorkDays(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const days = [...new Set(v.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n >= 1 && n <= 7))];
  return days.length > 0 ? days.sort().join(',') : fallback;
}

router.get('/', (req: Request, res: Response) => {
  const row = db.prepare(`SELECT ${SELECT_COLS} FROM app_settings WHERE user_id = ?`).get(uid(req));
  res.json(row ?? DEFAULTS);
});

router.put('/', (req: Request, res: Response) => {
  // Partielles Update: fehlende Felder behalten den Bestand (z. B. setzt das
  // Dashboard nur das Ziel, die Settings-Seite nur ihre Felder)
  const existing = (db.prepare('SELECT * FROM app_settings WHERE user_id = ?').get(uid(req)) ?? {}) as Record<string, unknown>;
  const pick = (key: keyof typeof DEFAULTS) =>
    req.body[key] !== undefined ? req.body[key] : existing[key] ?? DEFAULTS[key];

  const tzRaw = pick('timezone');
  const tz = tzRaw && isValidTimeZone(tzRaw) ? tzRaw : DEFAULT_TIMEZONE;

  const amountRaw = pick('goal_amount');
  const goalAmount = typeof amountRaw === 'number' && isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;
  const periodRaw = pick('goal_period');
  const goalPeriod = goalAmount !== null && GOAL_PERIODS.includes(periodRaw) ? periodRaw : null;

  const langRaw = pick('ui_lang');
  const uiLang = UI_LANGS.includes(langRaw) ? langRaw : null;

  const workDays = normalizeWorkDays(pick('work_days'), DEFAULTS.work_days);
  let workStart = numIn(pick('work_start'), 0, 23, DEFAULTS.work_start);
  let workEnd = numIn(pick('work_end'), 1, 24, DEFAULTS.work_end);
  if (workStart >= workEnd) { workStart = DEFAULTS.work_start; workEnd = DEFAULTS.work_end; }

  const longTimerHours = numIn(pick('long_timer_hours'), 0.5, 24, DEFAULTS.long_timer_hours);
  const idleMinutes = Math.round(numIn(pick('idle_minutes'), 1, 240, DEFAULTS.idle_minutes));
  const backupKeep = Math.round(numIn(pick('backup_keep'), 3, 365, DEFAULTS.backup_keep));

  const backupDirRaw = pick('backup_dir');
  const backupDir = typeof backupDirRaw === 'string' && backupDirRaw.trim() ? backupDirRaw.trim() : null;

  db.prepare(`
    INSERT INTO app_settings (
      user_id, sender_name, sender_address, signature_png, timezone,
      goal_amount, goal_period, ui_lang, work_days, work_start, work_end,
      long_timer_hours, idle_minutes, backup_dir, backup_keep, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      sender_name = excluded.sender_name,
      sender_address = excluded.sender_address,
      signature_png = excluded.signature_png,
      timezone = excluded.timezone,
      goal_amount = excluded.goal_amount,
      goal_period = excluded.goal_period,
      ui_lang = excluded.ui_lang,
      work_days = excluded.work_days,
      work_start = excluded.work_start,
      work_end = excluded.work_end,
      long_timer_hours = excluded.long_timer_hours,
      idle_minutes = excluded.idle_minutes,
      backup_dir = excluded.backup_dir,
      backup_keep = excluded.backup_keep,
      updated_at = datetime('now')
  `).run(
    uid(req), pick('sender_name'), pick('sender_address'), pick('signature_png'), tz,
    goalAmount, goalPeriod, uiLang, workDays, workStart, workEnd,
    longTimerHours, idleMinutes, backupDir, backupKeep,
  );

  const row = db.prepare(`SELECT ${SELECT_COLS} FROM app_settings WHERE user_id = ?`).get(uid(req));
  res.json(row);
});

export default router;
