import fs from 'fs';
import path from 'path';
import { db } from '../database.js';
import { dataDir } from './appPaths.js';

const KEEP_COUNT = 14;
const INTERVAL_MS = 6 * 60 * 60 * 1000; // alle 6 Stunden

/**
 * Backup-Zielordner: CLOCKITNOW_BACKUP_DIR → %OneDrive%\ClockItNow-Backups →
 * dataDir\backups. OneDrive bevorzugt, damit die Sicherung den Rechner verlässt.
 */
function resolveBackupDir(): string {
  const override = process.env.CLOCKITNOW_BACKUP_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
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
  const files = fs.readdirSync(dir).filter(f => /^clockitnow-.*\.db$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_COUNT))) {
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
  console.log(`Automatisches Backup aktiv: ${resolveBackupDir()} (alle 6 h, letzte ${KEEP_COUNT} Stände)`);
}
