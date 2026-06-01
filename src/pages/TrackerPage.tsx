import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTimer } from '../hooks/useTimer';
import { getProjects, getTimeEntries, updateTimeEntry } from '../api';
import TimerBar from '../components/Timer/TimerBar';
import TimeEntryList from '../components/Timer/TimeEntryList';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorBanner from '../components/ui/ErrorBanner';
import type { Project, TimeEntry } from '../types';

export default function TrackerPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const data = await getTimeEntries();
      setEntries(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [proj] = await Promise.all([getProjects({ active: true }), loadEntries()]);
      setProjects(Array.isArray(proj) ? proj : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setIsLoading(false);
    }
  }, [loadEntries]);

  useEffect(() => { load(); }, [load]);

  const { activeEntry, elapsed, isRunning, startTimer, stopTimer, updateStartTime } = useTimer(loadEntries);

  const handleUpdateActive = useCallback(async (data: {
    description?: string; project_id?: number | null; task_id?: number | null; is_billable?: number;
  }) => {
    if (!activeEntry) return;
    await updateTimeEntry(activeEntry.id, data as any);
  }, [activeEntry]);

  // Eindeutige Beschreibungen (neuester Eintrag pro Beschreibung) für Autocomplete
  const suggestions = useMemo(() => {
    const seen = new Map<string, TimeEntry>();
    for (const e of entries) {
      if (e.description && !seen.has(e.description)) seen.set(e.description, e);
    }
    return [...seen.values()];
  }, [entries]);

  const handleRestart = useCallback(async (entry: TimeEntry) => {
    if (isRunning) await stopTimer();
    startTimer(entry.description ?? '', entry.project_id, entry.is_billable === 1);
  }, [isRunning, stopTimer, startTimer]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <TimerBar
        elapsed={elapsed}
        isRunning={isRunning}
        projects={projects}
        onStart={startTimer}
        onStop={stopTimer}
        activeDescription={activeEntry?.description}
        activeProjectId={activeEntry?.project_id}
        activeTaskId={activeEntry?.task_id}
        activeIsBillable={activeEntry?.is_billable === 1}
        activeStartTime={activeEntry?.start_time}
        onUpdateStartTime={updateStartTime}
        onUpdateActive={handleUpdateActive}
        suggestions={suggestions}
      />
      <TimeEntryList
        entries={entries}
        projects={projects}
        onReload={loadEntries}
        onRestart={handleRestart}
      />
    </div>
  );
}
