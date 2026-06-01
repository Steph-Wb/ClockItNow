import { useState, useRef, useCallback } from 'react';
import { X, Upload, Check, AlertCircle, ChevronRight, Loader2 } from 'lucide-react';
import {
  parseClockifyCSV, uniqueClients, uniqueProjects, uniqueTasks,
  type ClockifyRow,
} from '../../utils/parseClockifyCSV';
import {
  getClients, createClient,
  getProjects, createProject,
  getTasks, createTask,
  getTimeEntries, createTimeEntry,
} from '../../api';
import { formatDate } from '../../utils/dateLocale';
import type { Client, Project, Task } from '../../types';

const PRESET_COLORS = ['#00BCD4','#4CAF50','#FF9800','#E91E63','#9C27B0','#2196F3','#F44336','#FF5722','#84CC16','#06B6D4'];

interface Props { onClose: () => void; onDone: () => void; }

type Step = 0 | 1 | 2 | 3 | 4 | 5;

interface ProjectKey { projektName: string; kundeName: string; hourlyRate: number; }
interface TaskKey    { aufgabeName: string; projektName: string; kundeName: string; }

export default function ImportModal({ onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>(0);
  const [rows, setRows] = useState<ClockifyRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [dateMin, setDateMin] = useState('');
  const [dateMax, setDateMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  // State from checks
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Map<number, Task[]>>(new Map());
  const [existingEntries, setExistingEntries] = useState<ReturnType<typeof getTimeEntries> extends Promise<infer T> ? T : never>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Step 0: File upload ─────────────────────────────────────────────────
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

  // ── Step 0 → 1: Kunden laden, dann anzeigen ────────────────────────────
  const goToStep1 = useCallback(async () => {
    setBusy(true);
    try {
      const existing = await getClients();
      setClients(existing);
      setStep(1);
    } finally { setBusy(false); }
  }, []);

  // ── Step 1 → 2: fehlende Kunden erstellen, Projekte laden ──────────────
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

      // Projekte vorladen für Schritt 2
      const existingProjects = await getProjects();
      setProjects(existingProjects);
      setStep(2);
    } finally { setBusy(false); }
  }, [rows, clients]);

  // ── Step 2 → 3: fehlende Projekte erstellen, Aufgaben laden ────────────
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

      // Aufgaben vorladen für Schritt 3
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

  // ── Step 3 → 4: fehlende Aufgaben erstellen, Einträge für Duplikatcheck laden
  const handleStep3 = useCallback(async () => {
    setBusy(true);
    try {
      const csvTasks = uniqueTasks(rows);
      const tasksMap = new Map(tasksByProject);

      // Nur fehlende Tasks erstellen (tasksMap ist bereits aus handleStep2 befüllt)
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

      // Vorhandene Zeiteinträge für Duplikatcheck laden
      if (dateMin && dateMax) {
        const existing = await getTimeEntries({ start: dateMin, end: dateMax });
        setExistingEntries(existing as any);
      }

      setStep(4);
    } finally { setBusy(false); }
  }, [rows, projects, tasksByProject, dateMin, dateMax]);

  // ── Step 4: Import ─────────────────────────────────────────────────────
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
    setProgressTotal(toImport.length);
    setProgress(0);
    let imported = 0;

    try {
      for (const row of toImport) {
        const projectId = resolveProjectId(row);
        const taskId = projectId ? resolveTaskId(row, projectId) : undefined;

        await createTimeEntry({
          description: row.beschreibung || undefined,
          project_id: projectId,
          task_id: taskId,
          start_time: row.startTime,
          end_time: row.endTime,
          is_billable: row.isBillable ? 1 : 0,
        });
        imported++;
        setProgress(imported);
      }
      setImportedCount(imported);
      setSkippedCount(toSkip);
      setStep(5);
    } finally { setBusy(false); }
  }, [toImport, toSkip]); // eslint-disable-line

  // ── Computed lists for display ──────────────────────────────────────────
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

  // ── Render ──────────────────────────────────────────────────────────────
  const STEP_LABELS = ['Upload', 'Kunden', 'Projekte', 'Aufgaben', 'Import', 'Fertig'];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="font-semibold text-primary">Clockify CSV importieren</h2>
          <button onClick={onClose} className="text-secondary hover:text-primary"><X size={18} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-border flex-shrink-0">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                i < step ? 'bg-accent/20 text-accent' :
                i === step ? 'bg-accent text-white' :
                'bg-background text-secondary'
              }`}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:inline ${i === step ? 'text-primary' : 'text-secondary'}`}>{label}</span>
              {i < STEP_LABELS.length - 1 && <ChevronRight size={12} className="text-secondary/40 mx-1" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 0: Upload ── */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-secondary">Lade eine Clockify-Detailexport-CSV-Datei hoch (Trennzeichen: Semikolon).</p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-accent transition-colors">
                <Upload size={28} className="text-secondary mb-2" />
                <span className="text-sm text-secondary">CSV-Datei auswählen</span>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
              </label>

              {rows.length > 0 && (
                <div className="bg-background rounded-lg p-4 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-secondary">Zeilen:</span><span className="text-primary font-medium">{rows.length}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Zeitraum:</span><span className="text-primary font-medium">{dateMin ? formatDate(dateMin) : '–'} – {dateMax ? formatDate(dateMax) : '–'}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Kunden:</span><span className="text-primary">{uniqueClients(rows).length}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Projekte:</span><span className="text-primary">{uniqueProjects(rows).length}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Aufgaben:</span><span className="text-primary">{uniqueTasks(rows).length}</span></div>
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="bg-red-900/20 border border-danger rounded-lg p-3 text-xs text-red-300 space-y-1">
                  {parseErrors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}

          {/* ── Step 1: Kunden ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-secondary">
                <span className="text-success font-medium">{csvClientNames.length - missingClients.length} existieren</span>
                {missingClients.length > 0 && <span className="ml-2 text-amber-400 font-medium">{missingClients.length} werden erstellt</span>}
              </p>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-secondary border-b border-border">
                  <th className="text-left py-2">Kundenname</th>
                  <th className="text-right py-2">Status</th>
                </tr></thead>
                <tbody>
                  {csvClientNames.map(name => (
                    <tr key={name} className="border-b border-border/40">
                      <td className="py-2 text-primary">{name}</td>
                      <td className="py-2 text-right">
                        {clientStatus(name) === 'exists'
                          ? <span className="text-success text-xs flex items-center gap-1 justify-end"><Check size={12} /> Existiert</span>
                          : <span className="text-amber-400 text-xs">+ Wird erstellt</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Step 2: Projekte ── */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-secondary">
                <span className="text-success font-medium">{csvProjects.length - missingProjects.length} existieren</span>
                {missingProjects.length > 0 && <span className="ml-2 text-amber-400 font-medium">{missingProjects.length} werden erstellt</span>}
              </p>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-secondary border-b border-border">
                  <th className="text-left py-2">Projekt</th>
                  <th className="text-left py-2">Kunde</th>
                  <th className="text-right py-2">Satz</th>
                  <th className="text-right py-2">Status</th>
                </tr></thead>
                <tbody>
                  {csvProjects.map(cp => (
                    <tr key={`${cp.projektName}|${cp.kundeName}`} className="border-b border-border/40">
                      <td className="py-2 text-primary">{cp.projektName}</td>
                      <td className="py-2 text-secondary">{cp.kundeName}</td>
                      <td className="py-2 text-right text-secondary text-xs">{cp.hourlyRate > 0 ? `CHF ${cp.hourlyRate}` : '–'}</td>
                      <td className="py-2 text-right">
                        {projectStatus(cp) === 'exists'
                          ? <span className="text-success text-xs flex items-center gap-1 justify-end"><Check size={12} /> Existiert</span>
                          : <span className="text-amber-400 text-xs">+ Wird erstellt</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Step 3: Aufgaben ── */}
          {step === 3 && (
            <div className="space-y-3">
              {csvTasks.length === 0
                ? <p className="text-sm text-secondary">Keine Aufgaben im CSV vorhanden.</p>
                : <>
                  <p className="text-sm text-secondary">
                    <span className="text-success font-medium">{csvTasks.length - missingTasks.length} existieren</span>
                    {missingTasks.length > 0 && <span className="ml-2 text-amber-400 font-medium">{missingTasks.length} werden erstellt</span>}
                  </p>
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-secondary border-b border-border">
                      <th className="text-left py-2">Aufgabe</th>
                      <th className="text-left py-2">Projekt</th>
                      <th className="text-right py-2">Status</th>
                    </tr></thead>
                    <tbody>
                      {csvTasks.map(ct => (
                        <tr key={`${ct.aufgabeName}|${ct.projektName}|${ct.kundeName}`} className="border-b border-border/40">
                          <td className="py-2 text-primary">{ct.aufgabeName}</td>
                          <td className="py-2 text-secondary">{ct.projektName}</td>
                          <td className="py-2 text-right">
                            {taskStatus(ct) === 'exists'
                              ? <span className="text-success text-xs flex items-center gap-1 justify-end"><Check size={12} /> Existiert</span>
                              : <span className="text-amber-400 text-xs">+ Wird erstellt</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>}
            </div>
          )}

          {/* ── Step 4: Import ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-background rounded-lg p-4 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-secondary">Einträge in CSV:</span><span className="text-primary font-medium">{rows.length}</span></div>
                <div className="flex justify-between"><span className="text-secondary">Bereits vorhanden (übersprungen):</span><span className="text-amber-400 font-medium">{toSkip}</span></div>
                <div className="flex justify-between"><span className="text-secondary">Werden importiert:</span><span className="text-success font-medium">{toImport.length}</span></div>
              </div>

              {busy && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-secondary">
                    <span>Importiere...</span>
                    <span>{progress} / {progressTotal}</span>
                  </div>
                  <div className="h-2 bg-background rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressTotal > 0 ? (progress / progressTotal) * 100 : 0}%` }} />
                  </div>
                </div>
              )}

              {toImport.length === 0 && !busy && (
                <div className="flex items-center gap-2 text-success text-sm">
                  <Check size={16} />
                  <span>Alle Einträge bereits vorhanden – nichts zu importieren.</span>
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Fertig ── */}
          {step === 5 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-success/20 flex items-center justify-center mx-auto">
                <Check size={28} className="text-success" />
              </div>
              <div>
                <p className="text-lg font-semibold text-primary">{importedCount} Einträge importiert</p>
                {skippedCount > 0 && <p className="text-sm text-secondary mt-1">{skippedCount} bereits vorhandene Einträge übersprungen</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="text-sm text-secondary hover:text-primary">
            {step === 5 ? 'Schliessen' : 'Abbrechen'}
          </button>

          <div className="flex gap-2">
            {step > 0 && step < 5 && !busy && (
              <button onClick={() => setStep(s => (s - 1) as Step)} className="px-4 py-2 text-sm border border-border rounded-lg text-secondary hover:text-primary">
                Zurück
              </button>
            )}

            {step === 0 && (
              <button
                onClick={goToStep1}
                disabled={rows.length === 0 || busy}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Weiter
              </button>
            )}

            {step === 1 && (
              <button onClick={handleStep1} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {missingClients.length > 0 ? `${missingClients.length} erstellen & weiter` : 'Weiter'}
              </button>
            )}

            {step === 2 && (
              <button onClick={handleStep2} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {missingProjects.length > 0 ? `${missingProjects.length} erstellen & weiter` : 'Weiter'}
              </button>
            )}

            {step === 3 && (
              <button onClick={handleStep3} disabled={busy} className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {missingTasks.length > 0 ? `${missingTasks.length} erstellen & weiter` : 'Weiter'}
              </button>
            )}

            {step === 4 && (
              <button
                onClick={toImport.length === 0 ? () => setStep(5) : handleImport}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {toImport.length === 0 ? 'Fertig' : `${toImport.length} Einträge importieren`}
              </button>
            )}

            {step === 5 && (
              <button onClick={() => { onDone(); onClose(); }} className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg">
                Timer-Liste aktualisieren
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
