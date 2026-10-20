import { app, BrowserWindow, Tray, Menu, Notification, dialog, powerMonitor, utilityProcess } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dataDir } from '../server/lib/appPaths.js';
import { appIcon, trayIcon } from './trayIcon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.CLOCKITNOW_PORT ?? 3001);
const BASE = `http://localhost:${PORT}`;

const POLL_MS = 15_000;                       // Timer-Status-Abfrage
const REMINDER_GAP_MS = 60 * 60 * 1000;       // „nichts getrackt" max. 1×/h

// Verhaltensparameter kommen aus den Server-Settings (Einstellungen-Seite);
// bis zum ersten erfolgreichen Abruf gelten diese Defaults
type BehaviorConfig = { workDays: number[]; workStart: number; workEnd: number; longTimerMs: number; idleThresholdS: number };
let behavior: BehaviorConfig = {
  workDays: [1, 2, 3, 4, 5],
  workStart: 9,
  workEnd: 17,
  longTimerMs: 4 * 60 * 60 * 1000,
  idleThresholdS: 10 * 60,
};

function applyServerSettings(s: Record<string, unknown> | null): void {
  if (!s) return;
  const days = String(s.work_days ?? '').split(',').map(Number).filter(n => n >= 1 && n <= 7);
  behavior = {
    workDays: days.length > 0 ? days : behavior.workDays,
    workStart: typeof s.work_start === 'number' ? s.work_start : behavior.workStart,
    workEnd: typeof s.work_end === 'number' ? s.work_end : behavior.workEnd,
    longTimerMs: typeof s.long_timer_hours === 'number' ? s.long_timer_hours * 3_600_000 : behavior.longTimerMs,
    idleThresholdS: typeof s.idle_minutes === 'number' ? s.idle_minutes * 60 : behavior.idleThresholdS,
  };
}

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
let idleDialog: AbortController | null = null;       // höchstens ein Inaktivitäts-Dialog gleichzeitig
let polling = false;                                  // verhindert überlappende Polls
let trayKey = '';                                     // Menü nur bei Änderung neu aufbauen
const toasts = new Map<ToastKind, Notification>();   // höchstens ein Toast je Art

type ToastKind = 'reminder' | 'long';

// Fehler im Main-Prozess dürfen weder Timer-Callbacks noch Fenster lahmlegen
process.on('uncaughtException', err => console.error('[main] uncaughtException', err));
process.on('unhandledRejection', err => console.error('[main] unhandledRejection', err));

// ── Server-Anbindung ─────────────────────────────────────────────────────────

// Dem Renderer mitteilen, dass sich der Timer außerhalb der Oberfläche geändert hat
function notifyRenderer(): void {
  if (!win || win.isDestroyed()) return;
  win.webContents
    .executeJavaScript("window.dispatchEvent(new Event('clockitnow:timer-changed'))")
    .catch(() => { /* Seite lädt gerade */ });
}
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
  serverProc.on('exit', code => console.error(`[server] beendet (Code ${code})`));

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
      signal: AbortSignal.timeout(10_000),
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
  tray.setToolTip(active
    ? `ClockItNow – ${entryLabel(active)} läuft seit ${fmtDuration(Date.now() - Date.parse(active.start_time))}`
    : 'ClockItNow – kein Timer läuft');
  // Icon + Menü sind aufwendig (PNG-Encoding, native Handles) – nur bei Änderung neu bauen
  const key = `${active ? `${active.id}:${entryLabel(active)}` : ''}|${settings.reminders}`;
  if (key === trayKey) return;
  trayKey = key;
  tray.setImage(trayIcon(!!active));
  tray.setContextMenu(buildMenu());
}

// ── Timer-Aktionen + Benachrichtigungen ──────────────────────────────────────
function closeIdleDialog(): void {
  idleDialog?.abort();
  idleDialog = null;
}

function closeToast(kind: ToastKind): void {
  toasts.get(kind)?.close();
  toasts.delete(kind);
}

// expectedId: verhindert, dass ein veralteter Dialog einen neueren Timer stoppt
async function stopTimer(endIso: string, expectedId?: number): Promise<void> {
  if (!active || (expectedId !== undefined && active.id !== expectedId)) return;
  const entry = active;
  // Ende darf nicht vor dem Start liegen (z. B. Idle begann vor Timer-Start)
  const minEnd = Date.parse(entry.start_time) + 60_000;
  const end = Math.max(Date.parse(endIso), minEnd);
  const res = await api(`/api/time-entries/${entry.id}`, {
    method: 'PUT',
    body: JSON.stringify({ end_time: new Date(end).toISOString() }),
  });
  if (res === null) {
    // Stopp fehlgeschlagen (oder Eintrag existiert nicht mehr) – echten Stand holen
    await poll();
    return;
  }
  if (active?.id === entry.id) active = null;
  closeIdleDialog();
  updateTray();
  notifyRenderer();
}

function notify(kind: ToastKind, title: string, body: string): void {
  if (!Notification.isSupported()) return;
  closeToast(kind);
  const n = new Notification({ title, body, icon: appIcon(64) });
  toasts.set(kind, n); // Referenz halten, sonst kann n vor 'click' garbage-collected werden
  n.on('click', showWindow);
  n.on('close', () => { if (toasts.get(kind) === n) toasts.delete(kind); });
  n.show();
}

function isWorkHours(): boolean {
  const now = new Date();
  const isoDay = now.getDay() === 0 ? 7 : now.getDay(); // Mo=1 … So=7
  return behavior.workDays.includes(isoDay)
    && now.getHours() >= behavior.workStart
    && now.getHours() < behavior.workEnd;
}

async function poll(): Promise<void> {
  if (polling) return; // hängender Request darf keine weiteren Polls stapeln
  polling = true;
  try {
    applyServerSettings(await api<Record<string, unknown>>('/api/settings'));

    const prevId = active?.id ?? null;
    const entry = await api<NonNullable<ActiveEntry>>('/api/time-entries/active');
    active = entry && entry.id ? entry : null;
    updateTray();
    // Timer wurde außerhalb des Fensters gestartet/gestoppt (Tray, Browser) → Oberfläche nachziehen
    if ((active?.id ?? null) !== prevId) notifyRenderer();

    if (active) {
      closeToast('reminder');
      const dur = Date.now() - Date.parse(active.start_time);
      if (dur > behavior.longTimerMs && longNotifiedId !== active.id) {
        longNotifiedId = active.id;
        notify('long', `Timer läuft seit ${fmtDuration(dur)}`, `„${entryLabel(active)}" – läuft der noch korrekt?`);
      }
    } else {
      closeToast('long');
      closeIdleDialog(); // Dialog bezieht sich auf einen Timer, der nicht mehr läuft
      if (settings.reminders && isWorkHours() && Date.now() - lastReminderAt > REMINDER_GAP_MS) {
        lastReminderAt = Date.now();
        notify('reminder', 'Kein Timer aktiv', 'Du trackst gerade nichts – Timer starten?');
      }
    }
  } finally {
    polling = false;
  }
}

// ── Idle-Erkennung ───────────────────────────────────────────────────────────
// Es ist immer höchstens ein Dialog offen: ein neuer ersetzt den alten.
async function askIdle(idleStartMs: number): Promise<void> {
  if (!active) return;
  const mins = Math.round((Date.now() - idleStartMs) / 60_000);
  if (mins < 1) return;
  const entryId = active.id;
  closeIdleDialog();
  const ctrl = new AbortController();
  idleDialog = ctrl;
  try {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'ClockItNow',
      message: `Du warst ${mins} Minuten inaktiv – der Timer lief weiter.`,
      detail: `Laufender Eintrag: „${entryLabel(active)}"`,
      buttons: ['Weiterlaufen lassen', 'Timer rückwirkend bei Inaktivitätsbeginn stoppen'],
      defaultId: 0,
      cancelId: 0,
      signal: ctrl.signal,
    });
    if (ctrl.signal.aborted) return; // ersetzt oder Timer inzwischen beendet
    if (response === 1) await stopTimer(new Date(idleStartMs).toISOString(), entryId);
  } catch (err) {
    if (!ctrl.signal.aborted) console.error('[main] askIdle', err);
  } finally {
    if (idleDialog === ctrl) idleDialog = null;
  }
}

function idleCheck(): void {
  const idleS = powerMonitor.getSystemIdleTime();
  if (!active) idleStartedAt = null;
  if (active && idleS >= behavior.idleThresholdS && idleStartedAt === null) {
    idleStartedAt = Date.now() - idleS * 1000;
  } else if (idleStartedAt !== null && idleS < 60) {
    const started = idleStartedAt;
    idleStartedAt = null;
    void askIdle(started);
  }
}

// ── Fenster + App-Lifecycle ──────────────────────────────────────────────────
function createWindow(): void {
  // icon: App-Logo (Taskleiste + Fenstertitel); zur Laufzeit aus logo.svg nachgezeichnet
  const w = new BrowserWindow({ width: 1240, height: 840, autoHideMenuBar: true, title: 'ClockItNow', icon: appIcon() });
  win = w;
  // Auto-Login über den lokalen Token: In der Desktop-App ist kein Passwort
  // nötig (gleiche Berechtigungsstufe wie Dateizugriff auf die DB)
  void w.loadURL(localToken ? `${BASE}/api/auth/local-login?token=${localToken}` : BASE);
  // Schließen minimiert in den Tray, beendet die App nicht
  w.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    if (!w.isDestroyed()) w.hide();
  });
  w.on('closed', () => { if (win === w) win = null; });
  // Windows-Abmelden/Herunterfahren darf nicht am versteckten Fenster scheitern
  w.on('session-end', () => { quitting = true; });
  w.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] render-process-gone', details.reason);
    if (!w.isDestroyed()) w.reload();
  });
  w.webContents.on('unresponsive', () => console.error('[main] Fenster reagiert nicht'));
}

function showWindow(): void {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

app.setAppUserModelId('com.clockitnow.app'); // nötig für Windows-Benachrichtigungen

// Chromium-Profil (Cache, Local Storage …) getrennt von den Nutzdaten halten –
// sonst landet es als productName-Default direkt neben der DB in %APPDATA%\ClockItNow
app.setPath('userData', path.join(dataDir, 'electron-profile'));

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

    const safePoll = () => poll().catch(err => console.error('[main] poll', err));
    void safePoll();
    setInterval(safePoll, POLL_MS);
    setInterval(() => {
      try { idleCheck(); } catch (err) { console.error('[main] idleCheck', err); }
    }, 30_000);

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
