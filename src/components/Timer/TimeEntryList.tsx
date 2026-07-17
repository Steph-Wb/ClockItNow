import { useState, useRef } from 'react';
import { parseISO, differenceInSeconds, addSeconds, format, isSameWeek, startOfWeek } from 'date-fns';
import { Pencil, Trash2, Play, DollarSign, Check, X, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EntryDatePicker from './EntryDatePicker';
import ProjectDropdown from './ProjectDropdown';
import TaskSelector from './TaskSelector';
import { formatDuration } from '../../utils/formatDuration';
import { formatDateHeader, formatTime, WEEK_OPTIONS } from '../../utils/dateLocale';
import { updateTimeEntry, deleteTimeEntry } from '../../api';
import type { TimeEntry, Project } from '../../types';

interface Props {
  entries: TimeEntry[];
  projects: Project[];
  onReload: () => void;
  onRestart: (entry: TimeEntry) => void;
}

interface EditState {
  id: number;
  field: 'description' | 'start_time' | 'end_time' | 'duration';
  value: string;
}

function parseDurationInput(val: string): number | null {
  const parts = val.trim().split(':').map(s => parseInt(s, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function durationToInput(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function entrySeconds(e: TimeEntry) {
  if (!e.end_time) return 0;
  return differenceInSeconds(parseISO(e.end_time), parseISO(e.start_time));
}

function groupByDay(entries: TimeEntry[]) {
  const days: Record<string, TimeEntry[]> = {};
  for (const e of entries) {
    const day = e.start_time.slice(0, 10);
    if (!days[day]) days[day] = [];
    days[day].push(e);
  }
  return Object.entries(days).sort(([a], [b]) => b.localeCompare(a));
}

function groupByWeek(dayGroups: [string, TimeEntry[]][]) {
  const weeks: { key: string; days: [string, TimeEntry[]][] }[] = [];
  for (const group of dayGroups) {
    const d = parseISO(group[0]);
    const weekStart = format(startOfWeek(d, WEEK_OPTIONS), 'yyyy-MM-dd');
    let week = weeks.find(w => w.key === weekStart);
    if (!week) { week = { key: weekStart, days: [] }; weeks.push(week); }
    week.days.push(group);
  }
  return weeks;
}

export default function TimeEntryList({ entries, projects, onReload, onRestart }: Props) {
  const { t } = useTranslation();
  const [editState, setEditState] = useState<EditState | null>(null);
  const [datePickerId, setDatePickerId] = useState<number | null>(null);
  const [projectEditId, setProjectEditId] = useState<number | null>(null);
  const dateButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const moveToDate = async (entry: typeof entries[0], newDate: Date) => {
    const oldStart = parseISO(entry.start_time);
    const newStart = new Date(newDate);
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), oldStart.getSeconds(), 0);
    const update: Record<string, string> = { start_time: newStart.toISOString() };
    if (entry.end_time) {
      const duration = differenceInSeconds(parseISO(entry.end_time), oldStart);
      update.end_time = addSeconds(newStart, duration).toISOString();
    }
    await updateTimeEntry(entry.id, update as any);
    onReload();
  };

  // Projektwechsel (bestimmt implizit auch den Kunden, da project → client) setzt
  // die Aufgabe zurück – eine Aufgabe des alten Projekts passt sonst nicht mehr
  const changeEntryProject = async (entry: TimeEntry, projectId: number | undefined) => {
    await updateTimeEntry(entry.id, { project_id: projectId ?? null, task_id: null } as any);
    onReload();
  };

  const changeEntryTask = async (entry: TimeEntry, taskId: number | undefined) => {
    await updateTimeEntry(entry.id, { task_id: taskId ?? null } as any);
    onReload();
  };

  const safeEntries = Array.isArray(entries) ? entries : [];
  const dayGroups = groupByDay(safeEntries);
  const weekGroups = groupByWeek(dayGroups);

  const saveEdit = async (entry: TimeEntry) => {
    if (!editState) return;
    const update: Partial<TimeEntry> = {};
    if (editState.field === 'description') update.description = editState.value;
    if (editState.field === 'start_time') {
      const base = parseISO(entry.start_time);
      const [h, m] = editState.value.split(':').map(Number);
      base.setHours(h, m, 0, 0);
      update.start_time = base.toISOString();
    }
    if (editState.field === 'end_time' && entry.end_time) {
      const base = parseISO(entry.end_time);
      const [h, m] = editState.value.split(':').map(Number);
      base.setHours(h, m, 0, 0);
      update.end_time = base.toISOString();
    }
    if (editState.field === 'duration') {
      const secs = parseDurationInput(editState.value);
      if (secs !== null && secs > 0) {
        update.end_time = addSeconds(parseISO(entry.start_time), secs).toISOString();
      }
    }
    await updateTimeEntry(entry.id, update);
    setEditState(null);
    onReload();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('timer.deleteConfirm'))) return;
    await deleteTimeEntry(id);
    onReload();
  };

  const toggleBillable = async (entry: TimeEntry) => {
    await updateTimeEntry(entry.id, { is_billable: entry.is_billable ? 0 : 1 });
    onReload();
  };

  if (safeEntries.length === 0) {
    return (
      <div className="text-center py-16 text-secondary text-sm">
        {t('timer.noEntries')}
      </div>
    );
  }

  const safeWeekGroups = weekGroups ?? [];

  return (
    <div className="space-y-6">
      {safeWeekGroups.map(week => {
        const safeDays = week.days ?? [];
        const weekSeconds = safeDays.flatMap(([, es]) => es ?? []).reduce((s, e) => s + entrySeconds(e), 0);
        const weekDate = parseISO(week.key);
        const isThisWeek = isSameWeek(weekDate, new Date(), WEEK_OPTIONS);
        return (
          <div key={week.key}>
            <div className="flex justify-between items-center mb-3 px-1">
              <span className="text-xs text-secondary font-medium uppercase tracking-wide">
                {isThisWeek
                  ? t('timer.thisWeek')
                  : t('timer.weekLabel', { week: format(weekDate, 'w'), from: format(weekDate, 'dd.MM'), to: format(startOfWeek(weekDate, WEEK_OPTIONS), 'dd.MM') })}
              </span>
              <span className="text-sm text-primary font-mono">{formatDuration(weekSeconds)}</span>
            </div>

            <div className="space-y-4">
              {safeDays.map(([day, dayEntries]) => {
                const safeDay = dayEntries ?? [];
                const daySeconds = safeDay.reduce((s, e) => s + entrySeconds(e), 0);
                return (
                  <div key={day} className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex justify-between items-center px-4 py-2.5 border-b border-border bg-sidebar/50">
                      <span className="text-sm text-secondary">{formatDateHeader(day)}</span>
                      <span className="text-sm font-mono text-primary">{formatDuration(daySeconds)}</span>
                    </div>

                    {safeDay.map(entry => (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 border-b border-border/50 last:border-0 group">
                        {entry.project_color && (
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.project_color }} />
                        )}

                        {/* Description */}
                        <div className="flex-1 min-w-0">
                          {editState?.id === entry.id && editState.field === 'description' ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                value={editState.value}
                                onChange={e => setEditState({ ...editState, value: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(entry); if (e.key === 'Escape') setEditState(null); }}
                                className="bg-background border border-accent rounded px-2 py-0.5 text-sm text-primary outline-none flex-1"
                              />
                              <button onClick={() => saveEdit(entry)} className="text-accent"><Check size={14} /></button>
                              <button onClick={() => setEditState(null)} className="text-secondary"><X size={14} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditState({ id: entry.id, field: 'description', value: entry.description ?? '' })}
                              className="text-sm text-primary text-left truncate hover:text-accent transition-colors w-full"
                            >
                              {entry.description || <span className="text-secondary italic">{t('timer.noDescription')}</span>}
                            </button>
                          )}
                          {projectEditId === entry.id ? (
                            <div className="flex items-center gap-1.5 mt-1">
                              <ProjectDropdown
                                value={entry.project_id}
                                onChange={pid => changeEntryProject(entry, pid)}
                              />
                              {entry.project_id && (
                                <TaskSelector
                                  projectId={entry.project_id}
                                  value={entry.task_id}
                                  onChange={tid => changeEntryTask(entry, tid)}
                                />
                              )}
                              <button onClick={() => setProjectEditId(null)} className="text-accent flex-shrink-0">
                                <Check size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setProjectEditId(entry.id)}
                              title={t('timer.editProject')}
                              className="text-xs text-secondary mt-0.5 block text-left hover:text-accent transition-colors truncate w-full"
                            >
                              {entry.task_name && <span className="text-accent/80">{entry.task_name} · </span>}
                              {entry.project_name || <span className="italic">{t('timer.noProject')}</span>}
                              {entry.client_name ? ` · ${entry.client_name}` : ''}
                            </button>
                          )}
                        </div>

                        {/* Time range */}
                        <div className="flex items-center gap-1 text-xs text-secondary font-mono">
                          {editState?.id === entry.id && editState.field === 'start_time' ? (
                            <input
                              autoFocus type="time" value={editState.value}
                              onChange={e => setEditState({ ...editState, value: e.target.value })}
                              onBlur={() => saveEdit(entry)}
                              className="bg-background border border-accent rounded px-1 py-0.5 text-xs text-primary outline-none w-20"
                            />
                          ) : (
                            <button onClick={() => setEditState({ id: entry.id, field: 'start_time', value: formatTime(entry.start_time) })} className="hover:text-primary">
                              {formatTime(entry.start_time)}
                            </button>
                          )}
                          <span>–</span>
                          {entry.end_time ? (
                            editState?.id === entry.id && editState.field === 'end_time' ? (
                              <input
                                autoFocus type="time" value={editState.value}
                                onChange={e => setEditState({ ...editState, value: e.target.value })}
                                onBlur={() => saveEdit(entry)}
                                className="bg-background border border-accent rounded px-1 py-0.5 text-xs text-primary outline-none w-20"
                              />
                            ) : (
                              <button onClick={() => setEditState({ id: entry.id, field: 'end_time', value: formatTime(entry.end_time!) })} className="hover:text-primary">
                                {formatTime(entry.end_time)}
                              </button>
                            )
                          ) : (
                            <span className="text-accent">{t('timer.running')}</span>
                          )}
                        </div>

                        {/* Duration */}
                        <div className="w-20 text-right flex-shrink-0">
                          {entry.end_time && editState?.id === entry.id && editState.field === 'duration' ? (
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                autoFocus
                                value={editState.value}
                                onChange={e => setEditState({ ...editState, value: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(entry); if (e.key === 'Escape') setEditState(null); }}
                                onBlur={() => saveEdit(entry)}
                                placeholder="H:MM"
                                className="bg-background border border-accent rounded px-1 py-0.5 text-xs text-primary outline-none w-14 text-center font-mono"
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => entry.end_time && setEditState({
                                id: entry.id,
                                field: 'duration',
                                value: durationToInput(entrySeconds(entry)),
                              })}
                              title={entry.end_time ? t('timer.editDuration') : undefined}
                              className={`font-mono text-sm tabular-nums transition-colors ${
                                entry.end_time
                                  ? 'text-primary hover:text-accent cursor-pointer'
                                  : 'text-secondary cursor-default'
                              }`}
                            >
                              {entry.end_time ? formatDuration(entrySeconds(entry)) : '–'}
                            </button>
                          )}
                        </div>

                        {/* Date picker button */}
                        <div className="relative flex-shrink-0">
                          <button
                            ref={el => { if (el) dateButtonRefs.current.set(entry.id, el); else dateButtonRefs.current.delete(entry.id); }}
                            onClick={() => setDatePickerId(datePickerId === entry.id ? null : entry.id)}
                            title={t('timer.moveDate')}
                            className={`p-1 rounded transition-colors ${datePickerId === entry.id ? 'text-accent' : 'text-secondary/40 hover:text-secondary'}`}
                          >
                            <CalendarDays size={14} />
                          </button>
                          {datePickerId === entry.id && (
                            <EntryDatePicker
                              entryDate={entry.start_time}
                              anchorRef={{ current: dateButtonRefs.current.get(entry.id) ?? null }}
                              onSelect={newDate => moveToDate(entry, newDate)}
                              onClose={() => setDatePickerId(null)}
                            />
                          )}
                        </div>

                        {/* Billable toggle */}
                        <button
                          onClick={() => toggleBillable(entry)}
                          title={entry.is_billable ? t('timer.billable') : t('timer.notBillable')}
                          className={`p-1 rounded transition-colors ${entry.is_billable ? 'text-accent' : 'text-secondary/40'}`}
                        >
                          <DollarSign size={14} />
                        </button>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => onRestart(entry)} title={t('timer.restart')}
                            className="p-1 rounded text-secondary hover:text-accent transition-colors">
                            <Play size={14} />
                          </button>
                          <button onClick={() => setEditState({ id: entry.id, field: 'description', value: entry.description ?? '' })}
                            title={t('common.edit')}
                            className="p-1 rounded text-secondary hover:text-accent transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(entry.id)} title={t('common.delete')}
                            className="p-1 rounded text-secondary hover:text-danger transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
