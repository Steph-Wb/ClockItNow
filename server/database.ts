import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'clockitnow.db');

export const db = new DatabaseSync(DB_PATH);

/** Helper: prüft ob eine Spalte in einer Tabelle existiert */
function hasColumn(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some(c => c.name === column);
}

export function initDatabase(): void {
  db.exec(`PRAGMA journal_mode = WAL`);
  db.exec(`PRAGMA foreign_keys = ON`);

  // ── Auth-Tabellen ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS magic_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Datentabellen ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      street TEXT,
      zip_city TEXT,
      rapport_postfix INTEGER,
      rapport_description TEXT,
      rounding_step INTEGER DEFAULT 15,
      rounding_mode TEXT DEFAULT 'up',
      currency TEXT DEFAULT 'CHF',
      is_active INTEGER DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      color TEXT DEFAULT '#00BCD4',
      hourly_rate REAL DEFAULT 0,
      is_billable INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      is_active INTEGER DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      is_billable INTEGER DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      sender_name TEXT,
      sender_address TEXT,
      signature_png TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Additive Migrationen für bestehende Datenbanken ──────────────────────
  if (!hasColumn('time_entries', 'task_id'))
    db.exec(`ALTER TABLE time_entries ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`);

  if (!hasColumn('clients', 'user_id'))
    db.exec(`ALTER TABLE clients ADD COLUMN user_id INTEGER REFERENCES users(id)`);

  if (!hasColumn('clients', 'rapport_description'))
    db.exec(`ALTER TABLE clients ADD COLUMN rapport_description TEXT`);

  if (!hasColumn('clients', 'street'))
    db.exec(`ALTER TABLE clients ADD COLUMN street TEXT`);

  if (!hasColumn('clients', 'zip_city'))
    db.exec(`ALTER TABLE clients ADD COLUMN zip_city TEXT`);

  if (!hasColumn('clients', 'rapport_postfix'))
    db.exec(`ALTER TABLE clients ADD COLUMN rapport_postfix INTEGER`);

  if (!hasColumn('projects', 'user_id'))
    db.exec(`ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id)`);

  if (!hasColumn('tasks', 'user_id'))
    db.exec(`ALTER TABLE tasks ADD COLUMN user_id INTEGER REFERENCES users(id)`);

  if (!hasColumn('time_entries', 'user_id'))
    db.exec(`ALTER TABLE time_entries ADD COLUMN user_id INTEGER REFERENCES users(id)`);

  if (!hasColumn('app_settings', 'timezone'))
    db.exec(`ALTER TABLE app_settings ADD COLUMN timezone TEXT DEFAULT 'Europe/Zurich'`);

  // Zeitstempel, wann ein Eintrag in einem Arbeitsrapport abgerechnet/rapportiert wurde (NULL = noch offen)
  if (!hasColumn('time_entries', 'billed_at'))
    db.exec(`ALTER TABLE time_entries ADD COLUMN billed_at TEXT`);

  // Rundungsregel pro Kunde für den Arbeitsrapport (Raster in Minuten + Richtung)
  if (!hasColumn('clients', 'rounding_step'))
    db.exec(`ALTER TABLE clients ADD COLUMN rounding_step INTEGER DEFAULT 15`);

  if (!hasColumn('clients', 'rounding_mode'))
    db.exec(`ALTER TABLE clients ADD COLUMN rounding_mode TEXT DEFAULT 'up'`);
}
