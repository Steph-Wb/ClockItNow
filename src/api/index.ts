import type { Client, Project, Task, TimeEntry, DashboardData, ReportData, Period, AppSettings } from '../types';

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

// Auth
export const getAuthStatus = () =>
  req<{ loggedIn: boolean; hasUser: boolean; magicLinkAvailable: boolean }>('/api/auth/status');
export const register = (email: string, password: string) =>
  req<{ ok: boolean; email: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
export const login = (email: string, password: string) =>
  req<{ ok: boolean; email: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const logout = () =>
  req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
export const sendMagicLink = (email: string) =>
  req<{ ok: boolean }>('/api/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) });
export const verifyMagicLink = (token: string) =>
  req<{ ok: boolean; email: string }>(`/api/auth/magic-link/verify?token=${token}`);

// Clients
export const getClients = (active?: boolean) =>
  req<Client[]>(`/api/clients${active !== undefined ? `?active=${active ? 1 : 0}` : ''}`);
export const createClient = (data: Partial<Client>) =>
  req<Client>('/api/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateClient = (id: number, data: Partial<Client>) =>
  req<Client>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const archiveClient = (id: number) =>
  req<{ success: boolean }>(`/api/clients/${id}`, { method: 'DELETE' });

// Projects
export const getProjects = (params?: { clientId?: number; active?: boolean }) => {
  const qs = new URLSearchParams();
  if (params?.clientId) qs.set('clientId', String(params.clientId));
  if (params?.active !== undefined) qs.set('active', params.active ? '1' : '0');
  return req<Project[]>(`/api/projects${qs.toString() ? '?' + qs : ''}`);
};
export const createProject = (data: Partial<Project>) =>
  req<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) });
export const updateProject = (id: number, data: Partial<Project>) =>
  req<Project>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const archiveProject = (id: number) =>
  req<{ success: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });

// Time Entries
export const getTimeEntries = (params?: {
  start?: string; end?: string; clientId?: number; projectId?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.start) qs.set('start', params.start);
  if (params?.end) qs.set('end', params.end);
  if (params?.clientId) qs.set('clientId', String(params.clientId));
  if (params?.projectId) qs.set('projectId', String(params.projectId));
  return req<TimeEntry[]>(`/api/time-entries${qs.toString() ? '?' + qs : ''}`);
};
export const getActiveEntry = () => req<TimeEntry | null>('/api/time-entries/active');
export const createTimeEntry = (data: Partial<TimeEntry>) =>
  req<TimeEntry>('/api/time-entries', { method: 'POST', body: JSON.stringify(data) });
export const updateTimeEntry = (id: number, data: Partial<TimeEntry>) =>
  req<TimeEntry>(`/api/time-entries/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTimeEntry = (id: number) =>
  req<{ success: boolean }>(`/api/time-entries/${id}`, { method: 'DELETE' });
export const importTimeEntries = (entries: Partial<TimeEntry>[]) =>
  req<{ imported: number; skipped: number }>('/api/time-entries/import', { method: 'POST', body: JSON.stringify({ entries }) });

// Tasks
export const getTasks = (projectId: number) =>
  req<Task[]>(`/api/tasks?projectId=${projectId}`);
export const createTask = (data: { name: string; project_id: number }) =>
  req<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(data) });
export const updateTask = (id: number, data: Partial<Task>) =>
  req<Task>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// Dashboard
export const getDashboard = (period: Period, from?: string, to?: string) => {
  const qs = new URLSearchParams({ period });
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return req<DashboardData>(`/api/dashboard?${qs}`);
};

// Reports
export const getReports = (params: {
  from: string; to: string;
  clientIds?: number[]; projectIds?: number[];
  billable?: 'all' | 'billable' | 'non_billable';
  billed?: 'all' | 'billed' | 'unbilled';
  groupBy?: string;
}) => {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  if (params.clientIds?.length) qs.set('clientIds', params.clientIds.join(','));
  if (params.projectIds?.length) qs.set('projectIds', params.projectIds.join(','));
  if (params.billable && params.billable !== 'all') qs.set('billable', params.billable);
  if (params.billed && params.billed !== 'all') qs.set('billed', params.billed);
  if (params.groupBy) qs.set('groupBy', params.groupBy);
  return req<ReportData>(`/api/reports?${qs}`);
};

// Settings
export const getSettings = () => req<AppSettings>('/api/settings');
export const updateSettings = (data: Partial<AppSettings>) =>
  req<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(data) });
export const openBackupDir = () =>
  req<{ ok: boolean; dir: string }>('/api/settings/open-backup-dir', { method: 'POST' });

// Arbeitsrapport (binärer Download)
export const downloadArbeitsrapport = async (params: {
  from: string; to: string; clientId: number; projektText?: string; rapportNr?: string; lang?: string;
  projectIds?: number[]; billable?: 'all' | 'billable' | 'non_billable'; billed?: 'all' | 'billed' | 'unbilled';
}): Promise<Blob> => {
  const qs = new URLSearchParams({ from: params.from, to: params.to, clientId: String(params.clientId) });
  if (params.projektText) qs.set('projektText', params.projektText);
  if (params.rapportNr) qs.set('rapportNr', params.rapportNr);
  if (params.lang) qs.set('lang', params.lang);
  if (params.projectIds && params.projectIds.length) qs.set('projectIds', params.projectIds.join(','));
  if (params.billable && params.billable !== 'all') qs.set('billable', params.billable);
  if (params.billed && params.billed !== 'all') qs.set('billed', params.billed);
  const res = await fetch(`/api/arbeitsrapport?${qs}`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.blob();
};

// Bestätigung nach erfolgreichem Download: Einträge des Rapports als rapportiert markieren
export const markArbeitsrapportBilled = (params: {
  from: string; to: string; clientId: number;
  projectIds?: number[]; billable?: 'all' | 'billable' | 'non_billable'; billed?: 'all' | 'billed' | 'unbilled';
}) =>
  req<{ marked: number }>('/api/arbeitsrapport/mark-billed', { method: 'POST', body: JSON.stringify(params) });
