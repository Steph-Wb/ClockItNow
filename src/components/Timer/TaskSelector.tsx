import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTasks, createTask } from '../../api';
import type { Task } from '../../types';

interface Props {
  projectId: number;
  value: number | undefined;
  onChange: (taskId: number | undefined) => void;
}

export default function TaskSelector({ projectId, value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedTask = tasks.find(tk => tk.id === value);

  useEffect(() => {
    getTasks(projectId).then(setTasks).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const task = await createTask({ name: newName.trim(), project_id: projectId });
      setTasks(prev => [...prev, task]);
      onChange(task.id);
      setCreating(false);
      setNewName('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 border transition-colors ${
          value
            ? 'border-border text-primary hover:border-accent'
            : 'border-dashed border-border text-secondary hover:text-accent hover:border-accent'
        }`}
      >
        {selectedTask ? (
          <>
            <span className="max-w-[100px] truncate">{selectedTask.name}</span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(undefined); }}
              className="text-secondary hover:text-primary"
            >
              <X size={11} />
            </button>
          </>
        ) : (
          <>
            <Plus size={11} />
            <span>{t('timer.task')}</span>
            <ChevronDown size={11} className="text-secondary" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-sidebar border border-border rounded-xl shadow-2xl w-56">
          <div className="max-h-48 overflow-y-auto py-1">
            {value && (
              <button
                onClick={() => { onChange(undefined); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-white/5 transition-colors"
              >
                {t('timer.noTask')}
              </button>
            )}
            {tasks.length === 0 && !creating && (
              <p className="px-3 py-3 text-xs text-secondary text-center">{t('timer.noTasksYet')}</p>
            )}
            {tasks.map(tk => (
              <button
                key={tk.id}
                onClick={() => { onChange(tk.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-white/5 ${
                  tk.id === value ? 'text-accent' : 'text-primary'
                }`}
              >
                {tk.id === value && <Check size={12} className="flex-shrink-0" />}
                <span className="truncate">{tk.name}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-border p-2">
            {creating ? (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={t('timer.taskNamePlaceholder')}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                  className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-xs text-primary outline-none focus:border-accent"
                />
                <button
                  onClick={handleCreate}
                  disabled={saving || !newName.trim()}
                  className="px-2 py-1 text-xs bg-accent text-white rounded-lg disabled:opacity-50"
                >
                  <Check size={12} />
                </button>
                <button onClick={() => setCreating(false)} className="px-2 py-1 text-xs text-secondary border border-border rounded-lg">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-accent hover:bg-accent/5 rounded-lg transition-colors"
              >
                <Plus size={12} />
                {t('timer.createTask')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
