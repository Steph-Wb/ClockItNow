import fs from 'fs';
import path from 'path';
import { db } from '../database.js';
import { dataDir } from './appPaths.js';

const DEFAULT_KEEP = 14;
const INTERVAL_MS = 6 * 60 * 60 * 1000; // alle 6 Stunden

/** Backup-Konfiguration aus den App-Einstellungen (Einzelplatz: erste Zeile). */
function dbBackupConfig(): { dir: string | null; keep: number } {
  try {
    const row = db.prepare('SELECT backup_dir, backup_keep FROM app_settings LIMIT 1').get() as
      { backup_dir?: string | null; backup_keep?: number | null } | undefined;
    const keep = Number(row?.backup_keep);
    return {
      dir: row?.backup_dir?.trim() || null,
      keep: isFinite(keep) && keep >= 3 ? Math.round(keep) : DEFAULT_KEEP,
    };
  } catch {
    return { dir: null, keep: DEFAULT_KEEP };
  }
}

/**
 * Backup-Zielordner, Präzedenz: CLOCKITNOW_BACKUP_DIR (env) → Einstellung in
 * der DB → %OneDrive%\ClockItNow-Backups → dataDir\backups.
 * OneDrive bevorzugt, damit die Sicherung den Rechner verlässt.
 */
function resolveBackupDir(): string {
  const override = process.env.CLOCKITNOW_BACKUP_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
  const fromDb = dbBackupConfig().dir;
  if (fromDb) return path.resolve(fromDb);
  const oneDrive = process.env.OneDrive ?? process.env.ONEDRIVE;
  if (oneDrive && fs.existsSync(oneDrive)) return path.join(oneDrive, 'ClockItNow-Backups');
  return path.join(dataDir, 'backups');
}

/** Konsistente Kopie der DB per VACUUM INTO (WAL-sicher), danach Rotation. */
export function runBackup(): void {
  const dir = resolveBackupDir();
  fs.mkdirSync(dir, { recursive: true });

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const target = path.join(dir, `clockitnow-${stamp}.db`);
  if (fs.existsSync(target)) return; // gleicher Minutenstempel → bereits gesichert

  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  // Rotation: Dateinamen sortieren = chronologisch, nur die neuesten behalten
  const keep = dbBackupConfig().keep;
  const files = fs.readdirSync(dir).filter(f => /^clockitnow-.*\.db$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) {
    fs.unlinkSync(path.join(dir, f));
  }
}

/** Backup beim Start + Intervall; Fehler dürfen den Server nie beenden. */
export function startBackupSchedule(): void {
  const attempt = () => {
    try {
      runBackup();
    } catch (err) {
      console.error('Backup fehlgeschlagen:', err);
    }
  };
  attempt();
  setInterval(attempt, INTERVAL_MS).unref();
  console.log(`Automatisches Backup aktiv: ${resolveBackupDir()} (alle 6 h)`);
}
