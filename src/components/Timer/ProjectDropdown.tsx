import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, ChevronDown, X } from 'lucide-react';
import { getProjects, createProject, getClients } from '../../api';
import type { Project, Client } from '../../types';

interface Props {
  value: number | undefined;
  onChange: (projectId: number | undefined) => void;
  onProjectCreated?: (project: Project) => void;
}

export default function ProjectDropdown({ value, onChange, onProjectCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClientId, setNewClientId] = useState<number | undefined>();
  const [newColor, setNewColor] = useState('#00BCD4');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedProject = projects.find(p => p.id === value);

  const load = useCallback(async () => {
    const [proj, cli] = await Promise.all([
      getProjects({ active: true }),
      getClients(true),
    ]);
    setProjects(proj);
    setClients(cli);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => searchRef.current?.focus(), 50);
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Group projects by client
  const filtered = projects.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const grouped: { clientName: string; clientId: number | undefined; projects: Project[] }[] = [];
  for (const p of filtered) {
    const key = p.client_id ?? 0;
    let g = grouped.find(g => (g.clientId ?? 0) === key);
    if (!g) {
      g = { clientName: p.client_name ?? 'Kein Kunde', clientId: p.client_id, projects: [] };
      grouped.push(g);
    }
    g.projects.push(p);
  }

  const handleSelect = (projectId: number | undefined) => {
    onChange(projectId);
    setOpen(false);
    setSearch('');
    setCreating(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const project = await createProject({
        name: newName.trim(),
        client_id: newClientId,
        color: newColor,
        hourly_rate: 0,
        is_billable: 1,
      });
      await load();
      onChange(project.id);
      onProjectCreated?.(project);
      setCreating(false);
      setNewName('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const PRESET_COLORS = ['#00BCD4', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0', '#2196F3', '#F44336', '#FF5722'];

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger – split into open-area + clear-button to avoid nested <button> */}
      <div className={`flex items-center gap-1.5 text-sm rounded-lg px-2.5 py-1.5 border transition-colors cursor-pointer ${
        value
          ? 'border-border text-primary hover:border-accent'
          : 'border-dashed border-border text-secondary hover:text-accent hover:border-accent'
      }`}>
        <span className="flex items-center gap-1.5 flex-1" onClick={() => setOpen(v => !v)}>
          {selectedProject ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedProject.color }} />
              <span className="max-w-[120px] truncate">{selectedProject.name}</span>
            </>
          ) : (
            <>
              <Plus size={13} />
              <span>Projekt</span>
              <ChevronDown size={12} className="text-secondary" />
            </>
          )}
        </span>
        {selectedProject && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(undefined); }}
            className="text-secondary hover:text-primary flex-shrink-0"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-sidebar border border-border rounded-xl shadow-2xl w-72">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-1.5">
              <Search size={13} className="text-secondary flex-shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nach Projekt oder Kunde suchen"
                className="flex-1 bg-transparent text-sm text-primary placeholder-secondary outline-none"
                onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setSearch(''); } }}
              />
            </div>
          </div>

          {/* Project list */}
          <div className="max-h-64 overflow-y-auto py-1">
            {/* Clear selection */}
            {value && (
              <button
                onClick={() => handleSelect(undefined)}
                className="w-full text-left px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-white/5 transition-colors"
              >
                Kein Projekt
              </button>
            )}

            {grouped.length === 0 && (
              <p className="px-3 py-4 text-xs text-secondary text-center">Keine Projekte gefunden</p>
            )}

            {grouped.map(group => (
              <div key={group.clientId ?? 'none'}>
                <div className="px-3 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-secondary uppercase tracking-wide">
                    {group.clientName}
                  </span>
                  <span className="text-xs text-secondary/60">{group.projects.length} Projekte</span>
                </div>
                {group.projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-white/5 ${
                      p.id === value ? 'text-accent' : 'text-primary'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="truncate flex-1 text-left">{p.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Create new project */}
          <div className="border-t border-border p-2">
            {creating ? (
              <div className="space-y-2 p-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Projektname"
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-primary outline-none focus:border-accent"
                />
                <select
                  value={newClientId ?? ''}
                  onChange={e => setNewClientId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm text-primary outline-none"
                >
                  <option value="">Kein Kunde</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="flex items-center gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={saving || !newName.trim()}
                    className="flex-1 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50"
                  >
                    {saving ? 'Erstellen...' : 'Erstellen'}
                  </button>
                  <button
                    onClick={() => setCreating(false)}
                    className="px-3 py-1.5 text-xs text-secondary hover:text-primary border border-border rounded-lg"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-accent hover:bg-accent/5 rounded-lg transition-colors"
              >
                <Plus size={14} />
                Neues Projekt erstellen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
