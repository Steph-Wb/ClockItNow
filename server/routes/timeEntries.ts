import { Router, Request, Response } from 'express';
import { db } from '../database.js';

const router = Router();
const uid = (req: Request) => (req as any).user.id as number;

const isValidTimestamp = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));

/**
 * Prüft start/end eines Eintrags; bei Fehler wird die 400-Antwort gesendet und
 * false zurückgegeben. end === null/undefined ist erlaubt (laufender Timer).
 */
function validateTimes(res: Response, start: unknown, end: unknown): boolean {
  if (!isValidTimestamp(start) || (end != null && !isValidTimestamp(end))) {
    res.status(400).json({ error: 'errors.timeEntries.invalidTimestamp' });
    return false;
  }
  if (end != null && Date.parse(end as string) < Date.parse(start as string)) {
    res.status(400).json({ error: 'errors.timeEntries.endBeforeStart' });
    return false;
  }
  return true;
}

const SELECT_WITH_JOINS = `
  SELECT
    te.*,
    p.name as project_name,
    p.color as project_color,
    p.hourly_rate,
    c.name as client_name,
    t.name as task_name
  FROM time_entries te
  LEFT JOIN projects p ON te.project_id = p.id
  LEFT JOIN clients c ON p.client_id = c.id
  LEFT JOIN tasks t ON te.task_id = t.id
`;

// Must be before /:id to avoid route conflict
router.get('/active', (req: Request, res: Response) => {
  const row = db.prepare(`${SELECT_WITH_JOINS} WHERE te.end_time IS NULL AND te.user_id = ? ORDER BY te.start_time DESC LIMIT 1`).get(uid(req));
  res.json(row ?? null);
});

router.get('/', (req: Request, res: Response) => {
  const { start, end, clientId, projectId } = req.query;
  let sql = `${SELECT_WITH_JOINS} WHERE te.user_id = ?`;
  const params: unknown[] = [uid(req)];
  if (start) { sql += ' AND te.start_time >= ?'; params.push(start as string); }
  if (end) { sql += ' AND te.start_time <= ?'; params.push(end as string); }
  if (projectId) { sql += ' AND te.project_id = ?'; params.push(Number(projectId)); }
  if (clientId) { sql += ' AND c.id = ?'; params.push(Number(clientId)); }
  sql += ' ORDER BY te.start_time DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req: Request, res: Response) => {
  const { description, project_id, task_id, start_time, end_time, is_billable } = req.body;
  const start = start_time ?? new Date().toISOString();
  if (!validateTimes(res, start, end_time)) return;

  // Auf UTC-ISO normalisieren, damit die String-Vergleiche in den SQL-Filtern stimmen
  const startIso = new Date(start).toISOString();
  const endIso = end_time != null ? new Date(end_time).toISOString() : null;

  // Es darf höchstens einen laufenden Timer geben: ein neuer offener Eintrag
  // beendet einen evtl. noch offenen (auch verwaiste aus Doppelstarts).
  if (endIso === null) {
    db.prepare('UPDATE time_entries SET end_time = ? WHERE user_id = ? AND end_time IS NULL').run(startIso, uid(req));
  }

  const result = db.prepare(
    'INSERT INTO time_entries (description, project_id, task_id, start_time, end_time, is_billable, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    description ?? null,
    project_id ?? null,
    task_id ?? null,
    startIso,
    endIso,
    is_billable !== undefined ? Number(is_billable) : 1,
    uid(req)
  );
  const row = db.prepare(`${SELECT_WITH_JOINS} WHERE te.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM time_entries WHERE id = ? AND user_id = ?').get(Number(id), uid(req)) as any;
  if (!existing) return res.status(404).json({ error: 'errors.notFound' });
  const { description, project_id, task_id, start_time, end_time, is_billable } = req.body;

  // Effektive Werte nach dem Merge mit dem Bestand validieren
  const newStart = start_time ?? existing.start_time;
  const newEnd = end_time !== undefined ? end_time : existing.end_time;
  if (!validateTimes(res, newStart, newEnd)) return;

  db.prepare(
    'UPDATE time_entries SET description=?, project_id=?, task_id=?, start_time=?, end_time=?, is_billable=? WHERE id=? AND user_id=?'
  ).run(
    description !== undefined ? description : existing.description,
    project_id !== undefined ? (project_id === null ? null : Number(project_id)) : existing.project_id,
    task_id !== undefined ? (task_id === null ? null : Number(task_id)) : existing.task_id,
    new Date(newStart).toISOString(),
    newEnd != null ? new Date(newEnd).toISOString() : null,
    is_billable !== undefined ? Number(is_billable) : existing.is_billable,
    Number(id), uid(req)
  );
  const row = db.prepare(`${SELECT_WITH_JOINS} WHERE te.id = ?`).get(Number(id));
  res.json(row);
});

router.delete('/:id', (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM time_entries WHERE id = ? AND user_id = ?').get(Number(req.params.id), uid(req));
  if (!existing) return res.status(404).json({ error: 'errors.notFound' });
  db.prepare('DELETE FROM time_entries WHERE id = ? AND user_id = ?').run(Number(req.params.id), uid(req));
  res.json({ success: true });
});

export default router;
