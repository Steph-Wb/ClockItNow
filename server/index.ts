import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDatabase } from './database.js';
import { ensureJwtSecret } from './lib/secret.js';
import { startBackupSchedule } from './lib/backup.js';
import { requireAuth } from './middleware/requireAuth.js';
import authRouter from './routes/auth.js';
import clientsRouter from './routes/clients.js';
import projectsRouter from './routes/projects.js';
import timeEntriesRouter from './routes/timeEntries.js';
import dashboardRouter from './routes/dashboard.js';
import reportsRouter from './routes/reports.js';
import tasksRouter from './routes/tasks.js';
import settingsRouter from './routes/settings.js';
import arbeitsrapportRouter from './routes/arbeitsrapport.js';

// JWT-Secret: aus .env, sonst aus dataDir/secret.key (wird bei Bedarf erzeugt)
ensureJwtSecret();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Bewusst kein generisches PORT: das setzen manche Umgebungen (z. B. Preview-Tools) selbst
const PORT = Number(process.env.CLOCKITNOW_PORT ?? 3001);

// Produktionsmodus: gebautes Frontend vorhanden? Dann liefert Express es selbst aus.
const clientDir = [
  path.join(__dirname, '..', 'client'),         // kompiliert: dist/server → dist/client
  path.join(__dirname, '..', 'dist', 'client'), // dev (tsx): server/ → dist/client
].find(d => fs.existsSync(path.join(d, 'index.html')));

if (clientDir) {
  // Same-Origin-Betrieb: kein CORS nötig; APP_URL (z. B. Magic-Link) zeigt auf uns selbst
  if (!process.env.APP_URL) process.env.APP_URL = `http://localhost:${PORT}`;
} else {
  // Dev ohne Build: Vite-Dev-Server ist eine andere Origin
  app.use(cors({
    origin: process.env.APP_URL ?? 'http://localhost:5173',
    credentials: true,
  }));
}

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

initDatabase();
startBackupSchedule();

// ── Öffentliche Routen (kein Auth nötig) ────────────────────────────────────
app.use('/api/auth', authRouter);

// ── Geschützte Routen ────────────────────────────────────────────────────────
app.use('/api/clients',      requireAuth, clientsRouter);
app.use('/api/projects',     requireAuth, projectsRouter);
app.use('/api/time-entries', requireAuth, timeEntriesRouter);
app.use('/api/dashboard',    requireAuth, dashboardRouter);
app.use('/api/reports',      requireAuth, reportsRouter);
app.use('/api/tasks',        requireAuth, tasksRouter);
app.use('/api/settings',     requireAuth, settingsRouter);
app.use('/api/arbeitsrapport', requireAuth, arbeitsrapportRouter);

// ── Statisches Frontend + SPA-Fallback (nur wenn Build vorhanden) ───────────
if (clientDir) {
  app.use(express.static(clientDir));
  // Alle Nicht-API-GETs auf index.html → Client-Routing (z. B. /dashboard direkt)
  app.get(/^\/(?!api(\/|$)).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

// ── Zentraler Error-Handler (muss nach allen Routen registriert sein) ───────
// Fängt sync-Throws und – via asyncHandler – auch Fehler aus async-Routen ab,
// damit keine unhandled rejection den Prozess beendet.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unbehandelter Fehler:', err);
  if (!res.headersSent) res.status(500).json({ error: 'errors.internal' });
});

app.listen(PORT, () => {
  console.log(`ClockItNow ${clientDir ? 'läuft auf' : 'API-Server (nur API, kein Build) auf'} http://localhost:${PORT}`);
});
