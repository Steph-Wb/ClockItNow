import { useState, useRef, useCallback } from 'react';
import { X, Upload, Check, AlertCircle, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  parseClockifyCSV, uniqueClients, uniqueProjects, uniqueTasks,
  type ClockifyRow,
} from '../../utils/parseClockifyCSV';
import {
  getClients, createClient,
  getProjects, createProject,
  getTasks, createTask,
  getTimeEntries, importTimeEntries,
} from '../../api';
import { formatDate } from '../../utils/dateLocale';
import type { Client, Project, Task } from '../../types';

const PRESET_COLORS = ['#00BCD4','#4CAF50','#FF9800','#E91E63','#9C27B0','#2196F3','#F44336','#FF5722','#84CC16','#06B6D4'];

interface Props { onClose: () => void; onDone: () => void; }

type Step = 0 | 1 | 2 | 3 | 4 | 5;

interface ProjectKey { projektName: string; kundeName: string; hourlyRate: number; }
interface TaskKey    { aufgabeName: string; projektName: string; kundeName: string; }

export default function ImportModal({ onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(0);
  const [rows, setRows] = useState<ClockifyRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [dateMin, setDateMin] = useState('');
  const [dateMax, setDateMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Map<number, Task[]>>(new Map());
  const [existingEntries, setExistingEntries] = useState<ReturnType<typeof getTimeEntries> extends Promise<infer T> ? T : never>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const result = parseClockifyCSV(text);
      setRows(result.rows);
      setParseErrors(result.errors);
      setDateMin(result.dateMin);
      setDateMax(result.dateMax);
    };
    reader.readAsText(file, 'utf-8');
  };

  const goToStep1 = useCallback(async () => {
    setBusy(true);
    try {
      const existing = await getClients();
      setClients(existing);
      setStep(1);
    } finally { setBusy(false); }
  }, []);

  const handleStep1 = useCallback(async () => {
    setBusy(true);
    try {
      const updated = [...clients];
      const missing = uniqueClients(rows).filter(
        n => !clients.some(c => c.name.toLowerCase() === n.toLowerCase())
      );
      for (const name of missing) {
        const created = await createClient({ name });
        updated.push(created);
      }
      setClients(updated);
      const existingProjects = await getProjects();
      setProjects(existingProjects);
      setStep(2);
    } finally { setBusy(false); }
  }, [rows, clients]);

  const handleStep2 = useCallback(async () => {
    setBusy(true);
    try {
      const updated = [...projects];
      const csvProjects = uniqueProjects(rows);
      let colorIdx = updated.length;

      for (const cp of csvProjects) {
        const found = updated.some(
          p => p.name.toLowerCase() === cp.projektName.toLowerCase()
            && (p.client_name ?? '').toLowerCase() === cp.kundeName.toLowerCase()
        );
        if (!found) {
          const client = clients.find(c => c.name.toLowerCase() === cp.kundeName.toLowerCase());
          const created = await createProject({
            name: cp.projektName,
            client_id: client?.id,
            color: PRESET_COLORS[colorIdx % PRESET_COLORS.length],
            hourly_rate: cp.hourlyRate,
            is_billable: 1,
          });
          updated.push(created);
          colorIdx++;
        }
      }
      setProjects(updated);

      const csvTasks = uniqueTasks(rows);
      const relevantIds = new Set(csvTasks.map(ct =>
        updated.find(p =>
          p.name.toLowerCase() === ct.projektName.toLowerCase() &&
          (p.client_name ?? '').toLowerCase() === ct.kundeName.toLowerCase()
        )?.id
      ).filter((id): id is number => id !== undefined));

      const tasksMap = new Map<number, Task[]>();
      for (const pid of relevantIds) {
        tasksMap.set(pid, await getTasks(pid));
      }
      setTasksByProject(tasksMap);
      setStep(3);
    } finally { setBusy(false); }
  }, [rows, clients, projects]);

  const handleStep3 = useCallback(async () => {
    setBusy(true);
    try {
      const csvTasks = uniqueTasks(rows);
      const tasksMap = new Map(tasksByProject);

      for (const ct of csvTasks) {
        const proj = projects.find(
          p => p.name.toLowerCase() === ct.projektName.toLowerCase()
            && (p.client_name ?? '').toLowerCase() === ct.kundeName.toLowerCase()
        );
        if (!proj) continue;

        const existing = tasksMap.get(proj.id) ?? [];
        const found = existing.some(t => t.name.toLowerCase() === ct.aufgabeName.toLowerCase());
        if (!found) {
          const created = await createTask({ name: ct.aufgabeName, project_id: proj.id });
          tasksMap.set(proj.id, [...existing, created]);
        }
      }
      setTasksByProject(tasksMap);

      if (dateMin && dateMax) {
        const existing = await getTimeEntries({ start: dateMin, end: dateMax });
        setExistingEntries(existing as any);
      }

      setStep(4);
    } finally { setBusy(false); }
  }, [rows, projects, tasksByProject, dateMin, dateMax]);

  const resolveProjectId = (row: ClockifyRow): number | undefined => {
    return projects.find(
      p => p.name.toLowerCase() === row.projektName.toLowerCase()
        && (p.client_name ?? '').toLowerCase() === row.kundeName.toLowerCase()
    )?.id;
  };

  const resolveTaskId = (row: ClockifyRow, projectId: number): number | undefined => {
    if (!row.aufgabeName) return undefined;
    const tasks = tasksByProject.get(projectId) ?? [];
    return tasks.find(t => t.name.toLowerCase() === row.aufgabeName.toLowerCase())?.id;
  };

  const isDuplicate = (row: ClockifyRow, projectId: number | undefined): boolean => {
    return (existingEntries as any[]).some(e =>
      e.start_time === row.startTime &&
      (e.description ?? '') === row.beschreibung &&
      (e.project_id ?? null) === (projectId ?? null)
    );
  };

  const toImport = rows.filter(r => !isDuplicate(r, resolveProjectId(r)));
  const toSkip = rows.length - toImport.length;

  const handleImport = useCallback(async () => {
    setBusy(true);
    try {
      // Ein einziger Bulk-Request: der Server schreibt in einer Transaktion
      // (alles oder nichts) und prüft Duplikate selbst – ein Retry nach einem
      // Fehler kann daher keine Duplikate mehr erzeugen.
      const payload = toImport.map(row => {
        const projectId = resolveProjectId(row);
        return {
          description: row.beschreibung || undefined,
          project_id: projectId,
          task_id: projectId ? resolveTaskId(row, projectId) : undefined,
          start_time: row.startTime,
          end_time: row.endTime,
          is_billable: row.isBillable ? 1 : 0,
        };
      });
      const result = await importTimeEntries(payload);
      setImportedCount(result.imported);
      setSkippedCount(toSkip + result.skipped);
      setStep(5);
    } finally { setBusy(false); }
  }, [toImport, toSkip]); // eslint-disable-line

  const csvClientNames = uniqueClients(rows);
  const csvProjects: ProjectKey[] = uniqueProjects(rows);
  const csvTasks: TaskKey[] = uniqueTasks(rows);

  const clientStatus = (name: string) =>
    clients.some(c => c.name.toLowerCase() === name.toLowerCase()) ? 'exists' : 'create';

  const projectStatus = (cp: ProjectKey) =>
    projects.some(p =>
      p.name.toLowerCase() === cp.projektName.toLowerCase() &&
      (p.client_name ?? '').toLowerCase() === cp.kundeName.toLowerCase()
    ) ? 'exists' : 'create';

  const taskStatus = (ct: TaskKey) => {
    const proj = projects.find(
      p => p.name.toLowerCase() === ct.projektName.toLowerCase()
        && (p.client_name ?? '').toLowerCase() === ct.kundeName.toLowerCase()
    );
    if (!proj) return 'create';
    const tasks = tasksByProject.get(proj.id) ?? [];
    return tasks.some(t => t.name.toLowerCase() === ct.aufgabeName.toLowerCase()) ? 'exists' : 'create';
  };

  const missingClients = csvClientNames.filter(n => clientStatus(n) === 'create');
  const missingProjects = csvProjects.filter(p => projectStatus(p) === 'create');
  const missingTasks = csvTasks.filter(t => taskStatus(t) === 'create');

  const stepLabels = t('import.stepLabels', { returnObjects: true }) as string[];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="font-semibold text-primary">{t('import.title')}</h2>
          <button onClick={onClose} className="text-secondary hover:text-primary"><X size={18} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-border flex-shrink-0">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                i < step ? 'bg-accent/20 text-accent' :
                i === step ? 'bg-accent text-white' :
                'bg-background text-secondary'
              }`}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:inline ${i === step ? 'text-primary' : 'text-secondary'}`}>{label}</span>
              {i < stepLabels.length - 1 && <ChevronRight size={12} className="text-secondary/40 mx-1" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step 0: Upload */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-secondary">{t('import.uploadHint')}</p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-accent transition-colors">
                <Upload size={28} className="text-secondary mb-2" />
                <span className="text-sm text-secondary">{t('import.selectFile')}</span>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
              </label>

              {rows.length > 0 && (
                <div className="bg-background rounded-lg p-4 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-secondary">{t('import.rows')}</span><span className="text-primary font-medium">{rows.length}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">{t('import.period')}</span><span className="text-primary font-medium">{dateMin ? formatDate(dateMin) : '–'} – {dateMax ? formatDate(dateMax) : '–'}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">{t('import.clients')}</span><span className="text-primary">{uniqueClients(rows).length}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">{t('import.projects')}</span><span className="text-primary">{uniqueProjects(rows).length}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">{t('import.tasks')}</span><span className="text-primary">{uniqueTasks(rows).length}</span></div>
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="bg-red-900/20 border border-danger rounded-lg p-3 text-xs text-red-300 space-y-1">
                  {parseErrors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Clients */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-secondary">
                <span className="text-success font-medium">{t('import.existCount', { count: csvClientNames.length - missingClients.length })}</span>
                {missingClients.length > 0 && <span className="ml-2 text-amber-400 font-medium">{t('import.createCount', { count: missingClients.length })}</span>}
              </p>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-secondary border-b border-border">
                  <th className="text-left py-2">{t('import.colClientName')}</th>
                  <th className="text-right py-2">{t('import.colStatus')}</th>
                </tr></thead>
                <tbody>
                  {csvClientNames.map(name => (
                    <tr key={name} className="border-b border-border/40">
                      <td className="py-2 text-primary">{name}</td>
                      <td className="py-2 text-right">
                        {clientStatus(name) === 'exists'
                          ? <span className="text-success text-xs flex items-center gap-1 justify-end"><Check size={12} /> {t('import.statusExists')}</span>
                          : <span className="text-amber-400 text-xs">{t('import.statusCreate')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Step 2: Projects */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-secondary">
                <span className="text-success font-medium">{t('import.existCount', { count: csvProjects.length - missingProjects.length })}</span>
                {missingProjects.length > 0 && <span className="ml-2 text-amber-400 font-medium">{t('import.createCount', { count: missingProjects.length })}</span>}
              </p>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-secondary border-b border-border">
                  <th className="text-left py-2">{t('import.colProject')}</th>
                  <th className="text-left py-2">{t('import.colClient')}</th>
                  <th className="text-right py-2">{t('import.colRate')}</th>
                  <th className="text-right py-2">{t('import.colStatus')}</th>
                </tr></thead>
                <tbody>
                  {csvProjects.map(cp => (
                    <tr key={`${cp.projektName}|${cp.kundeName}`} className="border-b border-border/40">
                      <td className="py-2 text-primary">{cp.projektName}</td>
                      <td className="py-2 text-secondary">{cp.kundeName}</td>
                      <td className="py-2 text-right text-secondary text-xs">{cp.hourlyRate > 0 ? `CHF ${cp.hourlyRate}` : '–'}</td>
                      <td className="py-2 text-right">
                        {projectStatus(cp) === 'exists'
                          ? <span className="text-success text-xs flex items-center gap-1 justify-end"><Check size={12} /> {t('import.statusExists')}</span>
                          : <span className="text-amber-400 text-xs">{t('import.statusCreate')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Step 3: Tasks */}
          {step === 3 && (
            <div className="space-y-3">
              {csvTasks.length === 0
                ? <p className="text-sm text-secondary">{t('import.noTasksInCsv')}</p>
                : <>
                  <p className="text-sm text-secondary">
                    <span className="text-success font-medium">{t('import.existCount', { count: csvTasks.length - missingTasks.length })}</span>
                    {missingTasks.length > 0 && <span className="ml-2 text-amber-400 font-medium">{t('import.createCount', { count: missingTasks.length })}</span>}
                  </p>
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-secondary border-b border-border">
                      <th className="text-left py-2">{t('import.colTask')}</th>
                      <th className="text-left py-2">{t('import.colProject')}</th>
                      <th className="text-right py-2">{t('import.colStatus')}</th>
                    </tr></thead>
                    <tbody>
                      {csvTasks.map(ct => (
                        <tr key={`${ct.aufgabeName}|${ct.projektName}|${ct.kundeName}`} className="border-b border-border/40">
                          <td className="py-2 text-primary">{ct.aufgabeName}</td>
                          <td className="py-2 text-secondary">{ct.projektName}</td>
                          <td className="py-2 text-right">
                            {taskStatus(ct) === 'exists'
                              ? <span className="text-success text-xs flex items-center gap-1 justify-end"><Check size={12} /> {t('import.statusExists')}</span>
                              : <span className="text-amber-400 text-xs">{t('import.statusCreate')}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>}
            </div>
          )}

          {/* Step 4: Import */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-background rounded-lg p-4 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-secondary">{t('import.entriesInCsv')}</span><span className="text-primary font-medium">{rows.length}</span></div>
                <div className="flex justify-between"><span className="text-secondary">{t('import.alreadyExist')}</span><span className="text-amber-400 font-medium">{toSkip}</span></div>
                <div className="flex justify-between"><span className="text-secondary">{t('import.toImport')}</span><span className="text-success font-medium">{toImport.length}</span></div>
              </div>

              {busy && (
                <div className="flex items-center gap-2 text-xs text-secondary">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{t('import.importing')}</span>
                </div>
              )}

              {toImport.length === 0 && !busy && (
                <div className="flex items-center gap-2 text-success text-sm">
                  <Check size={16} />
                  <span>{t('import.allExist')}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-success/20 flex items-center justify-center mx-auto">
                <Check size={28} className="text-success" />
              </div>
              <div>
                <p className="text-lg font-semibold text-primary">{t('import.importedCount', { count: importedCount })}</p>
                {skippedCount > 0 && <p className="text-sm text-secondary mt-1">{t('import.skippedCount', { count: skippedCount })}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="text-sm text-secondary hover:text-primary">
            {step === 5 ? t('common.close') : t('common.cancel')}
          </button>

          <div className="flex gap-2">
            {step > 0 && step < 5 && !busy && (
              <button onClick={() => setStep(s => (s - 1) as Step)} className="px-4 py-2 text-sm border border-border rounded-lg text-secondary hover:text-primary">
                {t('common.back')}
              </button>
            )}

            {step === 0 && (
              <button onClick={goToStep1} disabled={rows.length === 0 || busy}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {t('common.continue')}
              </button>
            )}

            {step === 1 && (
              <button onClick={handleStep1} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {missingClients.length > 0 ? t('import.createAndContinue', { count: missingClients.length }) : t('common.continue')}
              </button>
            )}

            {step === 2 && (
              <button onClick={handleStep2} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {missingProjects.length > 0 ? t('import.createAndContinue', { count: missingProjects.length }) : t('common.continue')}
              </button>
            )}

            {step === 3 && (
              <button onClick={handleStep3} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {missingTasks.length > 0 ? t('import.createAndContinue', { count: missingTasks.length }) : t('common.continue')}
              </button>
            )}

            {step === 4 && (
              <button onClick={toImport.length === 0 ? () => setStep(5) : handleImport} disabled={busy}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {toImport.length === 0 ? t('common.done') : t('import.importEntries', { count: toImport.length })}
              </button>
            )}

            {step === 5 && (
              <button onClick={() => { onDone(); onClose(); }} className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg">
                {t('import.refreshTimer')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
