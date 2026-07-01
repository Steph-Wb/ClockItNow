import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { getUserTimezone, localDateKey, addDaysKey, utcWindowForLocalRange } from '../lib/timezone.js';

const router = Router();

/**
 * Liefert den lokalen Datumsbereich [fromKey, toKey] (je 'YYYY-MM-DD') für einen Zeitraum.
 * Alle Grenzen werden in der gewählten Zeitzone des Users berechnet.
 */
function getPeriodRange(period: string, tz: string, from?: string, to?: string): { fromKey: string; toKey: string } {
  const todayKey = localDateKey(new Date().toISOString(), tz);

  const mondayOf = (key: string) => {
    const day = new Date(key + 'T00:00:00Z').getUTCDay(); // 0 = Sonntag
    return addDaysKey(key, day === 0 ? -6 : 1 - day);
  };
  const [y, m] = todayKey.split('-').map(Number);
  const monthRange = (year: number, month1: number) => ({
    fromKey: `${year}-${String(month1).padStart(2, '0')}-01`,
    toKey: new Date(Date.UTC(year, month1, 0)).toISOString().slice(0, 10), // letzter Tag von month1
  });

  switch (period) {
    case 'this_week': {
      const mon = mondayOf(todayKey);
      return { fromKey: mon, toKey: addDaysKey(mon, 6) };
    }
    case 'last_week': {
      const lastMon = addDaysKey(mondayOf(todayKey), -7);
      return { fromKey: lastMon, toKey: addDaysKey(lastMon, 6) };
    }
    case 'this_month':
      return monthRange(y, m);
    case 'last_month':
      return m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1);
    case 'this_year':
      return { fromKey: `${y}-01-01`, toKey: `${y}-12-31` };
    case 'custom':
      return { fromKey: from || todayKey, toKey: to || todayKey };
    default: {
      const mon = mondayOf(todayKey);
      return { fromKey: mon, toKey: todayKey };
    }
  }
}

router.get('/', (req: Request, res: Response) => {
  const { period = 'this_week', from, to } = req.query;
  const userId = (req as any).user.id as number;
  const tz = getUserTimezone(userId);
  const { fromKey, toKey } = getPeriodRange(period as string, tz, from as string, to as string);
  // SQL großzügig in UTC filtern; die exakte lokale Tagesgrenze ziehen wir unten in JS.
  const { start, end } = utcWindowForLocalRange(fromKey, toKey);

  const rows = db.prepare(`
    SELECT te.*, p.hourly_rate, p.color as project_color, p.name as project_name,
           c.id as client_id, c.name as client_name
    FROM time_entries te
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE te.user_id = ? AND te.end_time IS NOT NULL AND te.start_time >= ? AND te.start_time <= ?
  `).all(userId, start, end) as any[];

  // Nur Einträge behalten, deren lokales Datum tatsächlich im gewählten Bereich liegt.
  const entries = rows.filter(e => {
    const k = localDateKey(e.start_time, tz);
    return k >= fromKey && k <= toKey;
  });

  let totalSeconds = 0;
  let billableAmount = 0;
  let billableSeconds = 0;
  let billedAmount = 0;

  // Farbpalette für Kunden (keine Farbe in der DB)
  const CLIENT_COLORS = ['#3B82F6','#F59E0B','#10B981','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#14B8A6'];

  const byDay: Record<string, number> = {};
  const byProject: Record<number, { name: string; color: string; seconds: number; amount: number }> = {};
  const byClient: Record<string, { name: string; color: string; seconds: number; amount: number; idx: number }> = {};
  const topActivities: { description: string; project_name: string; seconds: number }[] = [];

  for (const e of entries) {
    const secs = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 1000;
    totalSeconds += secs;

    const dayKey = localDateKey(e.start_time, tz);
    byDay[dayKey] = (byDay[dayKey] ?? 0) + secs;

    if (e.is_billable && e.hourly_rate) {
      billableSeconds += secs;
      billableAmount += (secs / 3600) * e.hourly_rate;
      if (e.billed_at) billedAmount += (secs / 3600) * e.hourly_rate;
    }

    if (e.project_id) {
      if (!byProject[e.project_id]) {
        byProject[e.project_id] = { name: e.project_name, color: e.project_color, seconds: 0, amount: 0 };
      }
      byProject[e.project_id].seconds += secs;
      if (e.is_billable && e.hourly_rate) {
        byProject[e.project_id].amount += (secs / 3600) * e.hourly_rate;
      }
    }

    // Aggregation nach Kunde (kein Projekt → "Kein Kunde")
    const clientKey = e.client_id ? String(e.client_id) : '__none__';
    const clientName = e.client_name ?? 'Kein Kunde';
    if (!byClient[clientKey]) {
      const idx = Object.keys(byClient).length;
      byClient[clientKey] = { name: clientName, color: CLIENT_COLORS[idx % CLIENT_COLORS.length], seconds: 0, amount: 0, idx };
    }
    byClient[clientKey].seconds += secs;
    if (e.is_billable && e.hourly_rate) {
      byClient[clientKey].amount += (secs / 3600) * e.hourly_rate;
    }

    if (e.description) {
      const existing = topActivities.find(a => a.description === e.description);
      if (existing) { existing.seconds += secs; }
      else { topActivities.push({ description: e.description, project_name: e.project_name ?? '', seconds: secs }); }
    }
  }

  topActivities.sort((a, b) => b.seconds - a.seconds);

  res.json({
    totalSeconds,
    billableAmount,
    billedAmount,
    billablePercent: totalSeconds > 0 ? Math.round((billableSeconds / totalSeconds) * 100) : 0,
    byDay: (() => {
      // Alle Tage des Zeitraums auffüllen – auch Tage ohne Einträge erhalten seconds: 0
      const result: { date: string; seconds: number }[] = [];
      for (let key = fromKey; key <= toKey; key = addDaysKey(key, 1)) {
        result.push({ date: key, seconds: byDay[key] ?? 0 });
      }
      return result;
    })(),
    billableSeconds,
    byProject: Object.values(byProject).sort((a, b) => b.seconds - a.seconds),
    byClient: Object.values(byClient).sort((a, b) => b.seconds - a.seconds).map(({ idx: _idx, ...rest }) => rest),
    topActivities: topActivities.slice(0, 10),
    period: { start: fromKey, end: toKey },
  });
});

export default router;
