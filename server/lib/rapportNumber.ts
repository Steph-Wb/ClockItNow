/**
 * Laufende Rapport-Nummer pro Kunde und Jahr.
 *
 * Rapport-Nr. = `<JAHR>-<LFD-NR>[.<Postfix>]`, z.B. `2026-03.05`.
 * Die laufende Nummer zählt pro Kunde hoch (01, 02, 03 …) und beginnt mit
 * jedem neuen Jahr wieder bei 01 – unabhängig davon, wie oft pro Monat
 * abgerechnet wird.
 *
 * Gespeichert wird nur die zuletzt vergebene Nummer (`last_nr`). Das Ermitteln
 * der nächsten Nummer (`peekNextSeq`) verändert nichts; erst `commitSeq`
 * (nach erfolgreichem Erstellen des Rapports) schreibt den Zähler fort.
 */
import type { DatabaseSync } from 'node:sqlite';

export function ensureRapportCounterTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rapport_counters (
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      last_nr INTEGER NOT NULL,
      PRIMARY KEY (client_id, year)
    )
  `);
}

/** Jahr aus einem 'YYYY-MM-DD'-Datumsschlüssel (ohne Zeitzonen-Drift). */
export function yearOfDateKey(dateKey: string): number {
  return Number(dateKey.slice(0, 4));
}

/** Nächste freie laufende Nummer (ohne den Zähler zu verändern). */
export function peekNextSeq(db: DatabaseSync, clientId: number, year: number): number {
  const row = db.prepare('SELECT last_nr FROM rapport_counters WHERE client_id = ? AND year = ?')
    .get(clientId, year) as { last_nr: number } | undefined;
  return (row?.last_nr ?? 0) + 1;
}

/**
 * Zähler auf `seq` fortschreiben (nie rückwärts – idempotent bei Wiederholung).
 * Ohne `seq` wird die nächste freie Nummer vergeben.
 */
export function commitSeq(db: DatabaseSync, clientId: number, year: number, seq?: number): number {
  const value = seq != null && Number.isInteger(seq) && seq >= 1 ? seq : peekNextSeq(db, clientId, year);
  db.prepare(
    `INSERT INTO rapport_counters (client_id, year, last_nr) VALUES (?, ?, ?)
     ON CONFLICT(client_id, year) DO UPDATE SET last_nr = MAX(last_nr, excluded.last_nr)`
  ).run(clientId, year, value);
  return value;
}

export function formatRapportNr(year: number, seq: number, postfix?: number | null): string {
  const pf = postfix != null ? `.${String(postfix).padStart(2, '0')}` : '';
  return `${year}-${String(seq).padStart(2, '0')}${pf}`;
}
