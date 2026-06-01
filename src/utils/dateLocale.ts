import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subMonths, startOfYear, endOfYear, format, parseISO,
} from 'date-fns';
import { de } from 'date-fns/locale';

export const WEEK_OPTIONS = { weekStartsOn: 1 as const };

export const dateLocale = de;

export function getWeekRange(date = new Date()) {
  return {
    start: startOfWeek(date, WEEK_OPTIONS),
    end: endOfWeek(date, WEEK_OPTIONS),
  };
}

export function getPeriodRange(period: string, customFrom?: Date, customTo?: Date) {
  const now = new Date();
  switch (period) {
    case 'this_week': return { start: startOfWeek(now, WEEK_OPTIONS), end: endOfWeek(now, WEEK_OPTIONS) };
    case 'last_week': {
      const lastMon = startOfWeek(subMonths(now, 0), WEEK_OPTIONS);
      lastMon.setDate(lastMon.getDate() - 7);
      return { start: lastMon, end: endOfWeek(lastMon, WEEK_OPTIONS) };
    }
    case 'this_month': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_month': return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    case 'this_year': return { start: startOfYear(now), end: endOfYear(now) };
    case 'custom': return { start: customFrom ?? startOfMonth(now), end: customTo ?? endOfMonth(now) };
    default: return { start: startOfWeek(now, WEEK_OPTIONS), end: endOfWeek(now, WEEK_OPTIONS) };
  }
}

export function formatDate(date: Date | string, fmt = 'dd.MM.yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt, { locale: de });
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'HH:mm');
}

export function formatDateHeader(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'EEEE, d. MMMM yyyy', { locale: de });
}
