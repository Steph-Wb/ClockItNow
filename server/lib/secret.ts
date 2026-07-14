import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { dataDir } from './appPaths.js';

/**
 * Stellt sicher, dass process.env.JWT_SECRET gesetzt ist.
 * Priorität: .env/Umgebung → dataDir/secret.key → neu generieren und speichern.
 * Damit braucht die App keine manuelle .env-Pflege mehr.
 */
export function ensureJwtSecret(): void {
  if (process.env.JWT_SECRET) return;

  const keyFile = path.join(dataDir, 'secret.key');
  if (fs.existsSync(keyFile)) {
    const stored = fs.readFileSync(keyFile, 'utf8').trim();
    if (stored) {
      process.env.JWT_SECRET = stored;
      return;
    }
  }

  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile, secret, { encoding: 'utf8', mode: 0o600 });
  process.env.JWT_SECRET = secret;
  console.log(`Neues JWT-Secret erzeugt: ${keyFile}`);
}
