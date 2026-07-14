import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { dataDir } from './appPaths.js';

/**
 * Lokaler API-Token für den Electron-Hauptprozess (Tray, Idle-Dialoge).
 * Wird bei jedem Serverstart neu erzeugt und in dataDir abgelegt; nur Prozesse
 * mit Lesezugriff auf das Datenverzeichnis (= derselbe Windows-User) kennen ihn.
 */
export const localToken = crypto.randomBytes(32).toString('hex');

fs.writeFileSync(path.join(dataDir, 'local-token'), localToken, { encoding: 'utf8', mode: 0o600 });
