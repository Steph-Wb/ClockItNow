import { app, BrowserWindow, Tray, Menu, Notification, dialog, powerMonitor, utilityProcess } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dataDir } from '../server/lib/appPaths.js';
import { trayIcon } from './trayIcon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.CLOCKITNOW_PORT ?? 3001);
const BASE = `http://localhost:${PORT}`;

const POLL_MS = 15_000;                       // Timer-Status-Abfrage
const IDLE_THRESHOLD_S = 10 * 60;             // ab 10 Min Inaktivität nachfragen
const LONG_TIMER_MS = 4 * 60 * 60 * 1000;     // Hinweis bei Timern > 4 h
const REMINDER_GAP_MS = 60 * 60 * 1000;       // „nichts getrackt" max. 1×/h

// ── Einstellungen (Tray-Toggles), persistiert im Datenverzeichnis ────────────
const settingsFile = path.join(dataDir, 'electron-settings.json');
type Settings = { reminders: boolean };

function loadSettings(): Settings {
  try { return { reminders: true, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; }
  catch { return { reminders: true }; }
}
function saveSettings(s: Settings): void {
  fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2));
}
let settings = loadSettings();

// ── Zustand ──────────────────────────────────────────────────────────────────
type ActiveEntry = {
  id: number;
  description: string | null;
  start_time: string;
  project_name?: string | null;
} | null;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProc: ReturnType<typeof utilityProcess.fork> | null = null;
let localToken = '';
let quitting = false;

let active: ActiveEntry = null;
let longNotifiedId: number | null = null;
let lastReminderAt = Date.now(); // erste Erinnerung frühestens nach REMINDER_GAP_MS
let idleStartedAt: number | null = null;

// ── Server-Anbindung ─────────────────────────────────────────────────────────
async function isServerUp(): Promise<boolean> {
  try { return (await fetch(`${BASE}/api/auth/status`)).ok; } catch { return false; }
}

async function waitForServer(timeoutMs = 30_000): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await isServerUp()) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function startServer(): Promise<void> {
  // Läuft bereits ein Server (z. B. alter Autostart)? Dann mitbenutzen.
  if (await isServerUp()) {
    console.log(`Vorhandenen Server auf Port ${PORT} übernommen`);
    return;
  }
  const serverPath = path.join(__dirname, '..', 'server', 'index.js');
  serverProc = utilityProcess.fork(serverPath, [], {
    env: { ...process.env, CLOCKITNOW_PORT: String(PORT) },
    stdio: 'pipe',
    serviceName: 'clockitnow-server',
  });
  serverProc.stdout?.on('data', d => console.log('[server]', String(d).trimEnd()));
  serverProc.stderr?.on('data', d => console.error('[server]', String(d).trimEnd()));

  if (!(await waitForServer())) {
    dialog.showErrorBox('ClockItNow', 'Der lokale Server konnte nicht gestartet werden.');
    app.exit(1);
  }
}

function readLocalToken(): void {
  try { localToken = fs.readFileSync(path.join(dataDir, 'local-token'), 'utf8').trim(); }
  catch { localToken = ''; }
}

async function api<T>(pathname: string, init?: RequestInit): Promise<T | null> {
  if (!localToken) readLocalToken();
  try {
    const r = await fetch(`${BASE}${pathname}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-local-token': localToken, ...(init?.headers ?? {}) },
    });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

// ── Tray ─────────────────────────────────────────────────────────────────────
function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

function entryLabel(e: NonNullable<ActiveEntry>): string {
  return e.description || e.project_name || 'Timer';
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'ClockItNow öffnen', click: showWindow },
    {
      label: active ? `Timer stoppen (${entryLabel(active)})` : 'Timer stoppen',
      enabled: !!active,
      click: () => void stopTimer(new Date().toISOString()),
    },
    { type: 'separator' },
    {
      label: 'Erinnerung, wenn nichts getrackt wird',
      type: 'checkbox',
      checked: settings.reminders,
      click: mi => { settings = { ...settings, reminders: mi.checked }; saveSettings(settings); },
    },
    {
      label: 'Beim Anmelden starten',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      // Im Dev-Betrieb ist execPath electron.exe – ohne App-Pfad als Argument
      // würde beim Login nur eine leere Electron-Instanz starten
      click: mi => app.setLoginItemSettings({
        openAtLogin: mi.checked,
        path: process.execPath,
        args: app.isPackaged ? [] : [`"${app.getAppPath()}"`],
      }),
    },
    { type: 'separator' },
    { label: 'Beenden', click: () => { quitting = true; app.quit(); } },
  ]);
}

function updateTray(): void {
  if (!tray) return;
  tray.setImage(trayIcon(!!active));
  tray.setToolTip(active
    ? `ClockItNow – ${entryLabel(active)} läuft seit ${fmtDuration(Date.now() - Date.parse(active.start_time))}`
    : 'ClockItNow – kein Timer läuft');
  tray.setContextMenu(buildMenu());
}

// ── Timer-Aktionen + Benachrichtigungen ──────────────────────────────────────
async function stopTimer(endIso: string): Promise<void> {
  if (!active) return;
  // Ende darf nicht vor dem Start liegen (z. B. Idle begann vor Timer-Start)
  const minEnd = Date.parse(active.start_time) + 60_000;
  const end = Math.max(Date.parse(endIso), minEnd);
  await api(`/api/time-entries/${active.id}`, {
    method: 'PUT',
    body: JSON.stringify({ end_time: new Date(end).toISOString() }),
  });
  active = null;
  updateTray();
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  n.on('click', showWindow);
  n.show();
}

function isWorkHours(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0 = So
  return day >= 1 && day <= 5 && now.getHours() >= 9 && now.getHours() < 17;
}

async function poll(): Promise<void> {
  const entry = await api<NonNullable<ActiveEntry>>('/api/time-entries/active');
  active = entry && entry.id ? entry : null;
  updateTray();

  if (active) {
    const dur = Date.now() - Date.parse(active.start_time);
    if (dur > LONG_TIMER_MS && longNotifiedId !== active.id) {
      longNotifiedId = active.id;
      notify(`Timer läuft seit ${fmtDuration(dur)}`, `„${entryLabel(active)}" – läuft der noch korrekt?`);
    }
  } else if (settings.reminders && isWorkHours() && Date.now() - lastReminderAt > REMINDER_GAP_MS) {
    lastReminderAt = Date.now();
    notify('Kein Timer aktiv', 'Du trackst gerade nichts – Timer starten?');
  }
}

// ── Idle-Erkennung ───────────────────────────────────────────────────────────
async function askIdle(idleStartMs: number): Promise<void> {
  if (!active) return;
  const mins = Math.round((Date.now() - idleStartMs) / 60_000);
  if (mins < 1) return;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'ClockItNow',
    message: `Du warst ${mins} Minuten inaktiv – der Timer lief weiter.`,
    detail: `Laufender Eintrag: „${entryLabel(active)}"`,
    buttons: ['Weiterlaufen lassen', 'Timer rückwirkend bei Inaktivitätsbeginn stoppen'],
    defaultId: 0,
    cancelId: 0,
  });
  if (response === 1) await stopTimer(new Date(idleStartMs).toISOString());
}

function idleCheck(): void {
  const idleS = powerMonitor.getSystemIdleTime();
  if (active && idleS >= IDLE_THRESHOLD_S && idleStartedAt === null) {
    idleStartedAt = Date.now() - idleS * 1000;
  } else if (idleStartedAt !== null && idleS < 60) {
    const started = idleStartedAt;
    idleStartedAt = null;
    void askIdle(started);
  }
}

// ── Fenster + App-Lifecycle ──────────────────────────────────────────────────
function createWindow(): void {
  win = new BrowserWindow({ width: 1240, height: 840, autoHideMenuBar: true, title: 'ClockItNow' });
  void win.loadURL(BASE);
  // Schließen minimiert in den Tray, beendet die App nicht
  win.on('close', e => {
    if (!quitting) { e.preventDefault(); win?.hide(); }
  });
}

function showWindow(): void {
  if (!win || win.isDestroyed()) createWindow();
  else { win.show(); win.focus(); }
}

app.setAppUserModelId('com.clockitnow.app'); // nötig für Windows-Benachrichtigungen

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    await startServer();
    readLocalToken();

    tray = new Tray(trayIcon(false));
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
    updateTray();

    createWindow();

    void poll();
    setInterval(() => void poll(), POLL_MS);
    setInterval(idleCheck, 30_000);

    // Standby zählt wie Inaktivität
    let suspendAt: number | null = null;
    powerMonitor.on('suspend', () => { if (active) suspendAt = Date.now(); });
    powerMonitor.on('resume', () => {
      if (suspendAt !== null) { const s = suspendAt; suspendAt = null; void askIdle(s); }
    });
  });

  app.on('window-all-closed', () => { /* Tray-App: nicht beenden */ });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { serverProc?.kill(); });
}
