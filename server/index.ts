import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDatabase } from './database.js';
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

const app = express();
const PORT = 3001;

// CORS: Cookies erlauben + nur eigene App-URL zulassen
app.use(cors({
  origin: process.env.APP_URL ?? 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

initDatabase();

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

app.listen(PORT, () => {
  console.log(`ClockItNow API server running on http://localhost:${PORT}`);
});
