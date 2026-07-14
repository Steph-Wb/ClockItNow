import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Zentrales Datenverzeichnis der App (DB, secret.key, Backups-Fallback).
 * Standard: %APPDATA%\ClockItNow – übersteuerbar via CLOCKITNOW_DATA_DIR.
 */
function resolveDataDir(): string {
  const override = process.env.CLOCKITNOW_DATA_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'ClockItNow');
}

export const dataDir = resolveDataDir();
fs.mkdirSync(dataDir, { recursive: true });
