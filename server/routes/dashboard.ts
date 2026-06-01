import { Router, Request, Response } from 'express';
import { db } from '../database.js';

const router = Router();

function getPeriodDates(period: string, from?: string, to?: string): { start: string; end: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString();

  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  const getMonday = (d: Date) => {
    const x = new Date(d);
    const day = x.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    x.setDate(x.getDate() + diff);
    return startOfDay(x);
  };

  switch (period) {
    case 'this_week': {
      const start = getMonday(now);
      const end = new Date(start); end.setDate(start.getDate() + 6); endOfDay(end);
      return { start: toISO(start), end: toISO(endOfDay(new Date(start.getTime() + 6 * 86400000))) };
    }
    case 'last_week': {
      const thisMonday = getMonday(now);
      const lastMonday = new Date(thisMonday); lastMonday.setDate(lastMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday); lastSunday.setDate(lastSunday.getDate() + 6);
      return { start: toISO(lastMonday), end: toISO(endOfDay(lastSunday)) };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: toISO(startOfDay(start)), end: toISO(endOfDay(end)) };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toISO(startOfDay(start)), end: toISO(endOfDay(end)) };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return { start: toISO(startOfDay(start)), end: toISO(endOfDay(end)) };
    }
    case 'custom':
      return {
        start: from ? new Date(from).toISOString() : toISO(startOfDay(now)),
        end: to ? new Date(to).toISOString() : toISO(endOfDay(now)),
      };
    default:
      return { start: toISO(getMonday(now)), end: toISO(endOfDay(now)) };
  }
}

router.get('/', (req: Request, res: Response) => {
  const { period = 'this_week', from, to } = req.query;
  const { start, end } = getPeriodDates(period as string, from as string, to as string);
  const userId = (req as any).user.id as number;

  const entries = db.prepare(`
    SELECT te.*, p.hourly_rate, p.color as project_color, p.name as project_name,
           c.id as client_id, c.name as client_name
    FROM time_entries te
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE te.user_id = ? AND te.end_time IS NOT NULL AND te.start_time >= ? AND te.start_time <= ?
  `).all(userId, start, end) as any[];

  let totalSeconds = 0;
  let billableAmount = 0;
  let billableSeconds = 0;

  // Farbpalette für Kunden (keine Farbe in der DB)
  const CLIENT_COLORS = ['#3B82F6','#F59E0B','#10B981','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#14B8A6'];

  const byDay: Record<string, number> = {};
  const byProject: Record<number, { name: string; color: string; seconds: number; amount: number }> = {};
  const byClient: Record<string, { name: string; color: string; seconds: number; amount: number; idx: number }> = {};
  const topActivities: { description: string; project_name: string; seconds: number }[] = [];

  for (const e of entries) {
    const secs = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 1000;
    totalSeconds += secs;

    const dayKey = e.start_time.slice(0, 10);
    byDay[dayKey] = (byDay[dayKey] ?? 0) + secs;

    if (e.is_billable && e.hourly_rate) {
      billableSeconds += secs;
      billableAmount += (secs / 3600) * e.hourly_rate;
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
    billablePercent: totalSeconds > 0 ? Math.round((billableSeconds / totalSeconds) * 100) : 0,
    byDay: (() => {
      // Alle Tage des Zeitraums auffüllen – auch Tage ohne Einträge erhalten seconds: 0
      const result: { date: string; seconds: number }[] = [];
      const cursor = new Date(start);
      const endDay = new Date(end);
      while (cursor <= endDay) {
        const key = cursor.toISOString().slice(0, 10);
        result.push({ date: key, seconds: byDay[key] ?? 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return result;
    })(),
    billableSeconds,
    byProject: Object.values(byProject).sort((a, b) => b.seconds - a.seconds),
    byClient: Object.values(byClient).sort((a, b) => b.seconds - a.seconds).map(({ idx: _idx, ...rest }) => rest),
    topActivities: topActivities.slice(0, 10),
    period: { start, end },
  });
});

export default router;
