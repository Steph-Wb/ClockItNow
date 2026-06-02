import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Square, DollarSign, Check } from 'lucide-react';
import { format, parseISO, subMinutes, isFuture } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../utils/formatDuration';
import ProjectDropdown from './ProjectDropdown';
import TaskSelector from './TaskSelector';
import type { Project, TimeEntry } from '../../types';

interface Props {
  elapsed: number;
  isRunning: boolean;
  projects: Project[];
  onStart: (description: string, projectId?: number, isBillable?: boolean, taskId?: number) => void;
  onStop: () => void;
  onUpdateStartTime?: (newStartTime: string) => Promise<void>;
  onUpdateActive?: (data: {
    description?: string;
    project_id?: number | null;
    task_id?: number | null;
    is_billable?: number;
  }) => Promise<void>;
  activeDescription?: string;
  activeProjectId?: number;
  activeTaskId?: number;
  activeIsBillable?: boolean;
  activeStartTime?: string;
  suggestions?: TimeEntry[];
}

const QUICK_OFFSETS = [5, 10, 15, 30];

export default function TimerBar({
  elapsed, isRunning, onStart, onStop, onUpdateStartTime, onUpdateActive,
  activeDescription, activeProjectId, activeTaskId, activeIsBillable, activeStartTime,
  suggestions, projects,
}: Props) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [taskId, setTaskId] = useState<number | undefined>(undefined);
  const [isBillable, setIsBillable] = useState(true);

  const [showSug, setShowSug] = useState(false);
  const [sugIndex, setSugIndex] = useState(-1);

  const [showPopover, setShowPopover] = useState(false);
  const [editTime, setEditTime] = useState('');
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = useMemo(() => {
    if (!description.trim() || !suggestions?.length) return [];
    const words = description.toLowerCase().split(/\s+/).filter(Boolean);
    return suggestions
      .filter(e => words.every(w => (e.description ?? '').toLowerCase().includes(w)))
      .slice(0, 8);
  }, [description, suggestions]);

  const selectSuggestion = useCallback((entry: TimeEntry) => {
    setDescription(entry.description ?? '');
    if (!projectId && entry.project_id) {
      setProjectId(entry.project_id);
      setTaskId((entry as any).task_id ?? undefined);
    }
    setIsBillable(entry.is_billable === 1);
    setShowSug(false);
    setSugIndex(-1);
  }, [projectId]);

  useEffect(() => {
    if (isRunning) {
      setDescription(activeDescription ?? '');
      setProjectId(activeProjectId);
      setTaskId(activeTaskId);
      setIsBillable(activeIsBillable ?? true);
    } else {
      setDescription('');
      setProjectId(undefined);
      setTaskId(undefined);
      setIsBillable(true);
    }
  }, [isRunning, activeDescription, activeProjectId, activeTaskId, activeIsBillable]);

  const saveField = useCallback(async (data: Parameters<NonNullable<typeof onUpdateActive>>[0]) => {
    if (!isRunning || !onUpdateActive) return;
    await onUpdateActive(data);
  }, [isRunning, onUpdateActive]);

  const handleProjectChange = (pid: number | undefined) => {
    setProjectId(pid);
    setTaskId(undefined);
    if (pid !== undefined) {
      const proj = projects.find(p => p.id === pid);
      if (proj) {
        const billable = proj.is_billable === 1;
        setIsBillable(billable);
        if (isRunning) saveField({ project_id: pid, task_id: null, is_billable: billable ? 1 : 0 });
        return;
      }
    }
    if (isRunning) saveField({ project_id: pid ?? null, task_id: null });
  };

  const handleTaskChange = (tid: number | undefined) => {
    setTaskId(tid);
    if (isRunning) saveField({ task_id: tid ?? null });
  };

  const handleBillableToggle = () => {
    const next = !isBillable;
    setIsBillable(next);
    if (isRunning) saveField({ is_billable: next ? 1 : 0 });
  };

  const handleDescriptionBlur = () => {
    if (isRunning) saveField({ description });
  };

  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  const openPopover = () => {
    if (!isRunning || !activeStartTime) return;
    setEditTime(format(parseISO(activeStartTime), 'HH:mm'));
    setShowPopover(true);
  };

  const applyStartTime = async (timeStr: string) => {
    if (!activeStartTime || !onUpdateStartTime) return;
    const base = parseISO(activeStartTime);
    const [h, m] = timeStr.split(':').map(Number);
    const newDate = new Date(base);
    newDate.setHours(h, m, 0, 0);
    if (isFuture(newDate)) return;
    setSaving(true);
    try { await onUpdateStartTime(newDate.toISOString()); setShowPopover(false); }
    finally { setSaving(false); }
  };

  const applyQuickOffset = async (minutes: number) => {
    if (!activeStartTime || !onUpdateStartTime) return;
    setSaving(true);
    try { await onUpdateStartTime(subMinutes(parseISO(activeStartTime), minutes).toISOString()); setShowPopover(false); }
    finally { setSaving(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSug || filteredSuggestions.length === 0) {
      if (e.key === 'Enter') { if (isRunning) saveField({ description }); else handleToggle(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSugIndex(i => Math.min(i + 1, filteredSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSugIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sugIndex >= 0) { selectSuggestion(filteredSuggestions[sugIndex]); }
      else { setShowSug(false); if (isRunning) saveField({ description }); else handleToggle(); }
    } else if (e.key === 'Escape') {
      setShowSug(false);
      setSugIndex(-1);
    }
  };

  const handleToggle = async () => {
    if (isRunning) {
      if (onUpdateActive) await onUpdateActive({ description });
      onStop();
    } else {
      onStart(description, projectId, isBillable, taskId);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
      {/* Description with autocomplete */}
      <div className="relative flex-1 min-w-0">
        <input
          type="text"
          value={description}
          onChange={e => { setDescription(e.target.value); setShowSug(true); setSugIndex(-1); }}
          onBlur={() => { handleDescriptionBlur(); setTimeout(() => setShowSug(false), 150); }}
          onFocus={() => { if (description.trim()) setShowSug(true); }}
          onKeyDown={handleKeyDown}
          placeholder={t('timer.placeholder')}
          className="w-full bg-transparent text-primary placeholder-secondary text-sm outline-none"
        />

        {showSug && filteredSuggestions.length > 0 && (
          <div className="absolute top-full left-0 z-50 mt-2 bg-sidebar border border-border rounded-xl shadow-2xl min-w-[400px] max-h-60 overflow-y-auto">
            {filteredSuggestions.map((entry, i) => (
              <button
                key={entry.id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectSuggestion(entry)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  i === sugIndex ? 'bg-accent/10 text-accent' : 'hover:bg-white/5 text-primary'
                }`}
              >
                {entry.project_color && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.project_color }} />
                )}
                <span className="flex-1 truncate">{entry.description}</span>
                {entry.project_name && (
                  <span className="text-xs text-secondary flex-shrink-0 ml-2">{entry.project_name}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <ProjectDropdown value={projectId} onChange={handleProjectChange} />

      {projectId && (
        <TaskSelector projectId={projectId} value={taskId} onChange={handleTaskChange} />
      )}

      <button
        onClick={handleBillableToggle}
        title={isBillable ? t('timer.billable') : t('timer.notBillable')}
        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isBillable ? 'text-accent' : 'text-secondary'}`}
      >
        <DollarSign size={16} />
      </button>

      {/* Timer display with start-time popover */}
      <div className="relative flex-shrink-0" ref={popoverRef}>
        <button
          onClick={openPopover}
          disabled={!isRunning}
          title={isRunning ? t('timer.adjustStartTime') : undefined}
          className={`font-mono text-lg w-24 text-right tabular-nums transition-colors ${
            isRunning ? 'text-primary hover:text-accent cursor-pointer' : 'text-primary cursor-default'
          }`}
        >
          {formatDuration(elapsed)}
        </button>

        {showPopover && activeStartTime && (
          <div className="absolute right-0 top-full mt-2 z-50 bg-sidebar border border-border rounded-xl shadow-2xl p-4 w-64">
            <p className="text-xs font-medium text-secondary uppercase tracking-wide mb-3">{t('timer.adjustStartTime')}</p>
            <div className="flex gap-1.5 mb-3">
              {QUICK_OFFSETS.map(min => (
                <button key={min} onClick={() => applyQuickOffset(min)} disabled={saving}
                  className="flex-1 py-1 text-xs rounded-lg bg-background border border-border text-secondary hover:text-accent hover:border-accent transition-colors disabled:opacity-50">
                  -{min}min
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-secondary block mb-1">
                  {t('timer.time')} <span className="text-secondary/60 ml-1">{format(parseISO(activeStartTime), 'dd.MM.yyyy')}</span>
                </label>
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') applyStartTime(editTime); if (e.key === 'Escape') setShowPopover(false); }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-primary outline-none focus:border-accent font-mono" />
              </div>
              <button onClick={() => applyStartTime(editTime)} disabled={saving}
                className="mt-5 p-2 bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50 transition-colors">
                <Check size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* START / STOP */}
      <button
        onClick={handleToggle}
        className={`flex items-center flex-shrink-0 px-4 py-1.5 rounded-lg font-medium text-sm transition-colors ${
          isRunning ? 'bg-danger hover:bg-red-600 text-white' : 'bg-accent hover:bg-accent-hover text-white'
        }`}
      >
        {isRunning ? <Square size={14} /> : <Play size={14} />}
        <span className="ml-1.5">{isRunning ? t('timer.stop') : t('timer.start')}</span>
      </button>
    </div>
  );
}
