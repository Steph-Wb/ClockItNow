import { db } from '../database.js';

export const DEFAULT_TIMEZONE = 'Europe/Zurich';

/** Prüft, ob ein IANA-Zeitzonenname von der Laufzeit unterstützt wird. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Liest die in den Einstellungen gewählte Zeitzone des Users (Fallback: Europe/Zurich). */
export function getUserTimezone(userId: number): string {
  const row = db.prepare('SELECT timezone FROM app_settings WHERE user_id = ?').get(userId) as
    | { timezone?: string | null }
    | undefined;
  const tz = row?.timezone;
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validiert einen Datums-Query-Parameter ('YYYY-MM-DD', echtes Kalenderdatum).
 * Liefert den Key zurück oder null – unnormalisierte ('2026-7-1') und unmögliche
 * Daten ('2026-02-30') würden in addDaysKey/localDateKey werfen bzw. die
 * lexikalischen Vergleiche verfälschen.
 */
export function parseDateKey(v: unknown): string | null {
  if (typeof v !== 'string' || !DATE_KEY_RE.test(v)) return null;
  // Roundtrip-Check: V8 akzeptiert Tages-Überläufe ('2026-02-30' → 2. März),
  // daher reicht Date.parse nicht – das Datum muss sich selbst reproduzieren.
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

// Intl.DateTimeFormat ist teuer zu erzeugen – pro Zeitzone cachen.
const fmtCache = new Map<string, Intl.DateTimeFormat>();

/** Liefert das lokale Kalenderdatum ('YYYY-MM-DD') eines UTC-Zeitstempels in der gegebenen Zeitzone. */
export function localDateKey(iso: string, tz: string): string {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    // 'en-CA' formatiert als YYYY-MM-DD
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    fmtCache.set(tz, fmt);
  }
  return fmt.format(new Date(iso));
}

/** Addiert Tage zu einem 'YYYY-MM-DD'-String (reine Kalenderarithmetik, in UTC gerechnet). */
export function addDaysKey(key: string, days: number): string {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Großzügiges UTC-Fenster für einen lokalen Datumsbereich [fromKey, toKey].
 * Um je einen Tag geweitet, damit jeder Zeitzonen-Offset (max. ±14 h) sicher abgedeckt ist.
 * Die exakte Tagesgrenze wird anschließend in JS über localDateKey gezogen.
 */
export function utcWindowForLocalRange(fromKey: string, toKey: string): { start: string; end: string } {
  return {
    start: new Date(addDaysKey(fromKey, -1) + 'T00:00:00.000Z').toISOString(),
    end: new Date(addDaysKey(toKey, 1) + 'T23:59:59.999Z').toISOString(),
  };
}
