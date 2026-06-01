export interface ClockifyRow {
  projektName: string;
  kundeName: string;
  beschreibung: string;
  aufgabeName: string;   // leer wenn keine Aufgabe
  isBillable: boolean;
  startTime: string;     // ISO 8601
  endTime: string;       // ISO 8601
  hourlyRate: number;
}

/** DD.MM.YYYY + HH:MM:SS → ISO string (lokale Zeit) */
function clockifyToISO(date: string, time: string): string {
  const [d, m, y] = date.split('.');
  if (!d || !m || !y) throw new Error(`Ungültiges Datum: ${date}`);
  return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${time}`).toISOString();
}

export interface ParseResult {
  rows: ClockifyRow[];
  errors: string[];
  dateMin: string;  // ISO
  dateMax: string;  // ISO
}

export function parseClockifyCSV(text: string): ParseResult {
  // Strip BOM if present
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim());

  if (lines.length < 2) {
    return { rows: [], errors: ['Die Datei enthält keine Datenzeilen.'], dateMin: '', dateMax: '' };
  }

  const rows: ClockifyRow[] = [];
  const errors: string[] = [];

  // Skip header (line 0), parse from line 1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(';');

    // Expect at least 16 columns
    if (cols.length < 16) {
      errors.push(`Zeile ${i + 1}: zu wenig Spalten (${cols.length})`);
      continue;
    }

    try {
      const row: ClockifyRow = {
        projektName:  cols[0]?.trim() ?? '',
        kundeName:    cols[1]?.trim() ?? '',
        beschreibung: cols[2]?.trim() ?? '',
        aufgabeName:  cols[3]?.trim() ?? '',
        isBillable:   (cols[8]?.trim() ?? '').toLowerCase() === 'ja',
        startTime:    clockifyToISO(cols[9]?.trim() ?? '', cols[10]?.trim() ?? ''),
        endTime:      clockifyToISO(cols[11]?.trim() ?? '', cols[12]?.trim() ?? ''),
        hourlyRate:   parseFloat((cols[15]?.trim() ?? '0').replace(',', '.')) || 0,
      };
      if (!row.projektName) { errors.push(`Zeile ${i + 1}: kein Projektname`); continue; }
      rows.push(row);
    } catch (e) {
      errors.push(`Zeile ${i + 1}: ${e instanceof Error ? e.message : 'Fehler'}`);
    }
  }

  const times = rows.map(r => r.startTime).sort();
  return {
    rows,
    errors,
    dateMin: times[0] ?? '',
    dateMax: times[times.length - 1] ?? '',
  };
}

/** Deduplicate: unique (projektName+kundeName) combos from rows */
export function uniqueProjects(rows: ClockifyRow[]) {
  const map = new Map<string, { projektName: string; kundeName: string; hourlyRate: number }>();
  for (const r of rows) {
    const key = `${r.projektName.toLowerCase()}||${r.kundeName.toLowerCase()}`;
    if (!map.has(key)) map.set(key, { projektName: r.projektName, kundeName: r.kundeName, hourlyRate: r.hourlyRate });
  }
  return [...map.values()];
}

/** Deduplicate: unique (aufgabeName+projektName) combos (non-empty tasks only) */
export function uniqueTasks(rows: ClockifyRow[]) {
  const map = new Map<string, { aufgabeName: string; projektName: string; kundeName: string }>();
  for (const r of rows) {
    if (!r.aufgabeName) continue;
    const key = `${r.aufgabeName.toLowerCase()}||${r.projektName.toLowerCase()}||${r.kundeName.toLowerCase()}`;
    if (!map.has(key)) map.set(key, { aufgabeName: r.aufgabeName, projektName: r.projektName, kundeName: r.kundeName });
  }
  return [...map.values()];
}

/** Unique client names */
export function uniqueClients(rows: ClockifyRow[]): string[] {
  return [...new Set(rows.map(r => r.kundeName).filter(Boolean))];
}
