import ExcelJS from 'exceljs';
import { localDateKey } from './timezone.js';
import { DEFAULT_ROUNDING, normalizeRoundingRule, roundDurationsCapped, RoundingRule } from './rounding.js';

export interface RapportEntry {
  start_time: string;
  end_time: string | null;
  description: string | null;
  project_name?: string | null;
}

export interface BuildArbeitsrapportOptions {
  entries: RapportEntry[];
  client: { name: string; street?: string | null; zip_city?: string | null };
  sender: { name?: string | null; address?: string | null };
  signaturePngBase64?: string | null;
  projektText?: string | null;
  rapportNr: string;          // 'YYYY-MM'
  datum: string;              // Erstellungsdatum 'dd.mm.yyyy'
  lang?: 'de' | 'en';        // Sprache der xlsx-Labels (Default: 'de')
  tz: string;                 // IANA-Zeitzone für die Tages-Gruppierung/-Formatierung
  rounding?: RoundingRule;    // Rundungsregel des Kunden (Default: 15 min aufrunden)
}

/** Serverseitige Label-Map (gespiegelt zu arbeitsrapport.xlsx.* in den JSON-Dateien) */
const LABELS: Record<'de' | 'en', {
  title: string;
  client: string;
  reportNr: string;
  date: string;
  project: string;
  workPerformed: string;
  colDate: string;
  colDuration: string;
  colActivity: string;
  colDurationSum: string;
  subtotal: string;
  total: string;
  signature: string;
  noProject: string;
}> = {
  de: {
    title:        'Arbeitsrapport',
    client:       'Kunde',
    reportNr:     'Rapport-Nr.',
    date:         'Datum:',
    project:      'Projekt',
    workPerformed:'Ausgeführte Arbeiten',
    colDate:      'Datum',
    colDuration:  'Dauer',
    colActivity:  'Tätigkeit',
    colDurationSum:'Dauer sum.',
    subtotal:     'Zwischentotal',
    total:        'Total Arbeiten',
    signature:    'Datum / Unterschrift',
    noProject:    'Ohne Projekt',
  },
  en: {
    title:        'Work Report',
    client:       'Client',
    reportNr:     'Report No.',
    date:         'Date:',
    project:      'Project',
    workPerformed:'Work performed',
    colDate:      'Date',
    colDuration:  'Duration',
    colActivity:  'Activity',
    colDurationSum:'Duration sum.',
    subtotal:     'Subtotal',
    total:        'Total',
    signature:    'Date / Signature',
    noProject:    'No project',
  },
};

interface DayRow {
  date: string;               // 'dd.mm.yyyy'
  rawSeconds: number;         // exakte Dauer; Rundung passiert global über alle Blöcke
  dauer: number;              // Dezimalstunden nach Rundungsregel (wird nachträglich gesetzt)
  taetigkeit: string;         // mehrzeilig
  sum: number;                // kumuliert innerhalb des Projektblocks
}

interface ProjectBlock {
  projectName: string;
  days: DayRow[];
  subtotal: number;
}

/** 'dd.mm.yyyy' aus lokalem Datums-Key 'YYYY-MM-DD' */
function keyToDisplay(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
}

/** Einträge pro Kalendertag (in der Zeitzone tz) gruppieren; Rundung/Kumulation folgen später */
function groupByDay(entries: RapportEntry[], tz: string): DayRow[] {
  const map = new Map<string, { seconds: number; descriptions: string[] }>();

  for (const e of entries) {
    if (!e.end_time) continue;
    const key = localDateKey(e.start_time, tz);
    const secs = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 1000;
    const entry = map.get(key) ?? { seconds: 0, descriptions: [] };
    entry.seconds += secs;
    const desc = (e.description ?? '').trim();
    if (desc && !entry.descriptions.includes(desc)) entry.descriptions.push(desc);
    map.set(key, entry);
  }

  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // 'YYYY-MM-DD' sortiert chronologisch
    .map(([key, v]) => ({
      date: keyToDisplay(key),
      rawSeconds: v.seconds,
      dauer: 0,
      taetigkeit: v.descriptions.join('\n'),
      sum: 0,
    }));
}

/** Einträge nach Projekt (in Reihenfolge des ersten Auftretens) gruppieren */
function groupByProject(entries: RapportEntry[], tz: string): ProjectBlock[] {
  const order: string[] = [];
  const map = new Map<string, RapportEntry[]>();
  for (const e of entries) {
    const name = (e.project_name ?? '').trim() || '__NO_PROJECT__';
    if (!map.has(name)) { map.set(name, []); order.push(name); }
    map.get(name)!.push(e);
  }
  return order.map(name => ({ projectName: name, days: groupByDay(map.get(name)!, tz), subtotal: 0 }));
}

/**
 * Rundet alle Tageszeilen (blockübergreifend) nach der Kundenregel mit
 * gedeckelter Gesamtsumme und berechnet Laufsummen/Zwischentotale neu.
 */
function applyRounding(blocks: ProjectBlock[], rule: RoundingRule): void {
  const allDays = blocks.flatMap(b => b.days);
  const rounded = roundDurationsCapped(allDays.map(d => d.rawSeconds), rule);
  allDays.forEach((d, i) => { d.dauer = rounded[i] / 3600; });
  for (const b of blocks) {
    let running = 0;
    for (const d of b.days) { running += d.dauer; d.sum = running; }
    b.subtotal = running;
  }
}

const GREY = 'FFF2F2F2';
const BORDER = 'FFD0D0D0';
const BLACK = 'FF000000';
const thin = { style: 'thin' as const, color: { argb: BORDER } };
const thinBlack = { style: 'thin' as const, color: { argb: BLACK } };
const doubleBlack = { style: 'double' as const, color: { argb: BLACK } };

export function buildArbeitsrapportWorkbook(opts: BuildArbeitsrapportOptions): ExcelJS.Workbook {
  const L = LABELS[opts.lang ?? 'de'];

  // Resolve no-project placeholder to localized label
  const blocks_raw = groupByProject(opts.entries, opts.tz);
  const resolvedBlocks = blocks_raw.map(b => ({
    ...b,
    projectName: b.projectName === '__NO_PROJECT__' ? L.noProject : b.projectName,
  }));

  // Rundungsregel des Kunden anwenden (Deckelung über alle Blöcke hinweg)
  const rule = opts.rounding
    ? normalizeRoundingRule(opts.rounding.stepMinutes, opts.rounding.mode)
    : DEFAULT_ROUNDING;
  applyRounding(resolvedBlocks, rule);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ClockItNow';
  const ws = wb.addWorksheet(L.title, {
    pageSetup: { paperSize: 9, orientation: 'portrait', margins: { left: 0.7, right: 0.7, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 } },
  });

  // Spaltenbreiten: A=Datum, B=Dauer, C=Tätigkeit (~10 cm fürs Drucken), D=Dauer sum.
  // Breite in Zeichen; 10 cm @96dpi ≈ 378 px → (378-5)/7 ≈ 53.3 (Calibri 11)
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 53.3;
  ws.getColumn(4).width = 12;

  const blocks = resolvedBlocks;
  const total = blocks.reduce((s, b) => s + b.subtotal, 0);
  const showSubtotals = blocks.length > 1;

  let r = 1;

  // ── Titel (#1: Zeilenhöhe gross genug) ──────────────────────────────────────
  ws.mergeCells(r, 1, r, 4);
  const title = ws.getCell(r, 1);
  title.value = L.title;
  title.font = { bold: true, size: 26 };
  title.alignment = { vertical: 'middle' };
  ws.getRow(r).height = 42;
  r += 2;

  // ── Absender ────────────────────────────────────────────────────────────────
  if (opts.sender.name) {
    const c = ws.getCell(r, 1);
    c.value = opts.sender.name;
    c.font = { bold: true, size: 12 };
    r += 1;
  }
  if (opts.sender.address) {
    ws.mergeCells(r, 1, r, 2);
    const c = ws.getCell(r, 1);
    c.value = opts.sender.address;
    c.font = { size: 10 };
    r += 1;
  }
  r += 1;

  // ── Kunde: Label über grauem Block (#2) + Rapport-Nr./Datum rechtsbündig (#4) ─
  const kundeLabelRow = r;
  ws.getCell(kundeLabelRow, 1).value = L.client;
  ws.getCell(kundeLabelRow, 1).font = { bold: true };
  r += 1;

  const blockStart = r;             // Beginn grauer Block (Kundendaten)
  ws.getCell(r, 1).value = opts.client.name;
  ws.getCell(r, 1).font = { bold: true };
  ws.getCell(r + 1, 1).value = (opts.client.street ?? '').trim();
  ws.getCell(r + 1, 1).font = { size: 10 };
  ws.getCell(r + 2, 1).value = (opts.client.zip_city ?? '').trim();
  ws.getCell(r + 2, 1).font = { size: 10 };

  // Rapport-Nr. + Datum rechtsbündig (Label in C, Wert in D), um eine Zeile tiefer
  ws.getCell(r, 3).value = L.reportNr;
  ws.getCell(r, 3).font = { size: 10 };
  ws.getCell(r, 3).alignment = { horizontal: 'right' };
  ws.getCell(r, 4).value = opts.rapportNr;
  ws.getCell(r, 4).font = { bold: true };
  ws.getCell(r, 4).alignment = { horizontal: 'right' };
  ws.getCell(r + 1, 3).value = L.date;
  ws.getCell(r + 1, 3).font = { size: 10 };
  ws.getCell(r + 1, 3).alignment = { horizontal: 'right' };
  ws.getCell(r + 1, 4).value = opts.datum;            // #5: Erstellungsdatum
  ws.getCell(r + 1, 4).alignment = { horizontal: 'right' };

  // grauer Hintergrund über den Kunde-Block (A:B)
  for (let rr = blockStart; rr <= blockStart + 2; rr++) {
    for (let cc = 1; cc <= 2; cc++) {
      ws.getCell(rr, cc).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
    }
  }
  r = blockStart + 4;

  // ── Projekt ─────────────────────────────────────────────────────────────────
  ws.getCell(r, 1).value = L.project;
  ws.getCell(r, 1).font = { bold: true };
  r += 1;
  ws.mergeCells(r, 1, r, 4);
  const projCell = ws.getCell(r, 1);
  projCell.value = opts.projektText ?? '';
  projCell.alignment = { wrapText: true, vertical: 'top' };
  projCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
  ws.getRow(r).height = 22;
  r += 2;

  // ── Ausgeführte Arbeiten ────────────────────────────────────────────────────
  ws.getCell(r, 1).value = L.workPerformed;
  ws.getCell(r, 1).font = { bold: true };
  r += 1;

  // Tabellenkopf
  const headerRow = r;
  const headers = [L.colDate, L.colDuration, L.colActivity, L.colDurationSum];
  headers.forEach((h, i) => {
    const c = ws.getCell(headerRow, i + 1);
    c.value = h;
    c.font = { bold: true, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
    c.border = { top: thin, bottom: thin, left: thin, right: thin };
  });
  r += 1;

  // ── Projektblöcke (#9) ──────────────────────────────────────────────────────
  blocks.forEach((block, bi) => {
    if (bi > 0) r += 1;             // Leerzeile zwischen den Blöcken

    // Projektbezeichnung als eigene, fette Zeile
    const ph = ws.getCell(r, 1);
    ph.value = block.projectName;
    ph.font = { bold: true };
    r += 1;

    // Tageszeilen (Dauer sum. kumuliert innerhalb des Blocks)
    for (const d of block.days) {
      const row = ws.getRow(r);
      row.getCell(1).value = d.date;
      row.getCell(2).value = d.dauer;
      row.getCell(3).value = d.taetigkeit;
      row.getCell(4).value = d.sum;
      row.getCell(2).numFmt = '0.00';
      row.getCell(4).numFmt = '0.00';
      row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(1).alignment = { vertical: 'top' };
      row.getCell(2).alignment = { vertical: 'top', horizontal: 'right', indent: 1 };
      row.getCell(4).alignment = { vertical: 'top', horizontal: 'right', indent: 1 };
      for (let cc = 1; cc <= 4; cc++) row.getCell(cc).border = { bottom: thin };
      const lines = (d.taetigkeit.match(/\n/g)?.length ?? 0) + 1;
      if (lines > 1) row.height = 15 * lines;
      r += 1;
    }

    // Zwischentotal je Block (nur bei mehreren Projekten)
    if (showSubtotals) {
      const zt = ws.getRow(r);
      zt.getCell(3).value = L.subtotal;
      zt.getCell(3).font = { bold: true };
      zt.getCell(3).alignment = { horizontal: 'right' };
      zt.getCell(4).value = Math.round(block.subtotal * 100) / 100;
      zt.getCell(4).numFmt = '0.00';
      zt.getCell(4).font = { bold: true };
      zt.getCell(4).alignment = { horizontal: 'right', indent: 1 };
      zt.getCell(4).border = { top: thinBlack };       // Strich nur unter der Zahl
      r += 1;
    }
  });

  // ── Total Arbeiten ──────────────────────────────────────────────────────────
  const totalRow = ws.getRow(r);
  totalRow.getCell(3).value = L.total;
  totalRow.getCell(3).font = { bold: true };
  totalRow.getCell(3).alignment = { horizontal: 'right' };
  totalRow.getCell(3).border = { bottom: doubleBlack };                 // #8
  totalRow.getCell(4).value = Math.round(total * 100) / 100;
  totalRow.getCell(4).numFmt = '0.00';
  totalRow.getCell(4).font = { bold: true };
  totalRow.getCell(4).alignment = { horizontal: 'right', indent: 1 };
  totalRow.getCell(4).border = { top: thinBlack, bottom: doubleBlack }; // #7 (Strich nur unter der Zahl) + #8
  r += 3;

  // ── Unterschriftsblock ──────────────────────────────────────────────────────
  // Mehrere Zeilen Platz für die Unterschrift OBERHALB der Linie reservieren
  const sigSpaceTop = r + 2;                 // erste Zeile des Unterschrift-Raums
  const lineRow = sigSpaceTop + 3;           // Linie 3 Zeilen darunter
  for (let i = sigSpaceTop; i < lineRow; i++) ws.getRow(i).height = 16;

  ws.getCell(lineRow, 1).value = opts.datum;        // #6: Erstellungsdatum
  ws.getCell(lineRow, 1).font = { size: 10 };
  ws.getCell(lineRow, 1).alignment = { vertical: 'bottom' };
  ws.getCell(lineRow, 2).value = '_________________________________________________';
  ws.getCell(lineRow, 2).font = { size: 10 };
  ws.getCell(lineRow, 2).alignment = { vertical: 'bottom' };
  ws.mergeCells(lineRow, 2, lineRow, 4);
  ws.getCell(lineRow + 1, 2).value = L.signature;
  ws.getCell(lineRow + 1, 2).font = { size: 9, color: { argb: 'FF666666' } };

  // Unterschrift-Grafik sitzt im reservierten Raum direkt über der Linie
  // (0-basierte Anker; Bildunterkante endet knapp über der Linienzeile)
  if (opts.signaturePngBase64) {
    const base64 = opts.signaturePngBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageId = wb.addImage({ base64, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 1.2, row: sigSpaceTop - 1 } as any,   // ab der ersten reservierten Zeile
      ext: { width: 180, height: 58 },
    });
  }

  return wb;
}
