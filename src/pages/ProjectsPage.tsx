import { useState, useCallback } from 'react';
import { Plus, Pencil, Archive, ArchiveRestore, ChevronDown, ChevronRight } from 'lucide-react';
import { getProjects, createProject, updateProject, archiveProject, getClients, getTimeEntries } from '../api';
import { useApi } from '../hooks/useApi';
import ProjectModal from '../components/Projects/ProjectModal';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import { formatDuration } from '../utils/formatDuration';
import { formatCurrency } from '../utils/formatCurrency';
import { differenceInSeconds, parseISO } from 'date-fns';
import type { Project, Client } from '../types';

export default function ProjectsPage() {
  const [showActive, setShowActive] = useState<boolean | undefined>(true);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<number | undefined>(undefined);
  const [modalProject, setModalProject] = useState<Project | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchProjects = useCallback(() => getProjects(showActive !== undefined ? { active: showActive } : {}), [showActive]);
  const { data: projects, isLoading, error, reload } = useApi<Project[]>(fetchProjects, [showActive]);
  const { data: clients } = useApi<Client[]>(() => getClients(), []);
  const { data: allEntries } = useApi(() => getTimeEntries(), []);

  const getProjectStats = (projectId: number) => {
    const entries = (allEntries ?? []).filter(e => e.project_id === projectId && e.end_time);
    const seconds = entries.reduce((s, e) => s + differenceInSeconds(parseISO(e.end_time!), parseISO(e.start_time)), 0);
    const project = projects?.find(p => p.id === projectId);
    const amount = project?.hourly_rate ? (seconds / 3600) * project.hourly_rate : 0;
    return { seconds, amount };
  };

  const filtered = (projects ?? []).filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (clientFilter && p.client_id !== clientFilter) return false;
    return true;
  });

  const handleSave = async (data: Partial<Project>) => {
    if (modalProject?.id) await updateProject(modalProject.id, data);
    else await createProject(data);
    reload();
  };

  const toggleExpand = (id: number) => {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary">Projekte</h1>
        <button onClick={() => setModalProject(null)}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm">
          <Plus size={16} /> Neues Projekt
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..."
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-primary outline-none focus:border-accent w-48" />
        <select value={clientFilter ?? ''} onChange={e => setClientFilter(e.target.value ? Number(e.target.value) : undefined)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-primary outline-none">
          <option value="">Alle Kunden</option>
          {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex rounded-lg overflow-hidden border border-border">
          {[{ label: 'Aktiv', val: true }, { label: 'Archiviert', val: false }, { label: 'Alle', val: undefined }].map(({ label, val }) => (
            <button key={label} onClick={() => setShowActive(val)}
              className={`px-3 py-1.5 text-sm transition-colors ${showActive === val ? 'bg-accent/10 text-accent' : 'text-secondary hover:text-primary'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorBanner message={error} onRetry={reload} />}

      {!isLoading && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-secondary">
                <th className="text-left px-4 py-3 w-6" />
                <th className="text-left px-4 py-3">Projekt</th>
                <th className="text-left px-4 py-3">Kunde</th>
                <th className="text-right px-4 py-3">Zeit</th>
                <th className="text-right px-4 py-3">Betrag</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-secondary">Keine Projekte</td></tr>
              )}
              {filtered.map(project => {
                const { seconds, amount } = getProjectStats(project.id);
                const isExpanded = expanded.has(project.id);
                return (
                  <>
                    <tr key={project.id} className="border-b border-border/50 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => toggleExpand(project.id)} className="text-secondary hover:text-primary">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                          <span className="text-primary font-medium">{project.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-secondary">{project.client_name ?? '–'}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-primary">{formatDuration(seconds)}</td>
                      <td className="px-4 py-3 text-right text-secondary">{formatCurrency(amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${project.is_active ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-secondary'}`}>
                          {project.is_active ? 'Aktiv' : 'Archiviert'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setModalProject(project)} className="p-1 text-secondary hover:text-accent rounded"><Pencil size={14} /></button>
                          <button onClick={async () => { await (project.is_active ? archiveProject(project.id) : updateProject(project.id, { is_active: 1 })); reload(); }}
                            className="p-1 text-secondary hover:text-amber-400 rounded" title={project.is_active ? 'Archivieren' : 'Wiederherstellen'}>
                            {project.is_active ? <Archive size={14} /> : <ArchiveRestore size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${project.id}-detail`} className="border-b border-border/50 bg-sidebar/50">
                        <td />
                        <td colSpan={6} className="px-4 py-3 text-xs text-secondary space-y-1">
                          <div>Stundensatz: <span className="text-primary">{formatCurrency(project.hourly_rate)}/h</span></div>
                          <div>Abrechenbar: <span className="text-primary">{project.is_billable ? 'Ja' : 'Nein'}</span></div>
                          <div>Erfasste Zeit: <span className="text-primary font-mono">{formatDuration(seconds)}</span></div>
                          <div>Betrag: <span className="text-primary">{formatCurrency(amount)}</span></div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalProject !== undefined && (
        <ProjectModal
          project={modalProject}
          clients={(clients ?? []).filter(c => c.is_active)}
          onSave={handleSave}
          onClose={() => setModalProject(undefined)}
        />
      )}
    </div>
  );
}
