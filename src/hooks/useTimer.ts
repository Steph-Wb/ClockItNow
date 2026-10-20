import { useState, useEffect, useRef, useCallback } from 'react';
import { differenceInSeconds, parseISO } from 'date-fns';
import { getActiveEntry, createTimeEntry, updateTimeEntry } from '../api';
import type { TimeEntry } from '../types';

const SYNC_MIN_MS = 5_000; // Fokus-Sync nicht öfter als alle 5 s

// onStop: nach einem Stopp aus der Oberfläche; onSync: wenn der Timer extern
// (Tray, Inaktivitäts-Dialog, anderes Fenster) geändert wurde
export function useTimer(onStop?: () => void, onSync?: () => void) {
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncRef = useRef(0);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  // Guard gegen Doppelklick: verhindert zwei parallele Start-/Stop-Requests
  const pendingRef = useRef(false);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const startInterval = useCallback((entry: TimeEntry) => {
    stopInterval();
    intervalRef.current = setInterval(() => {
      setElapsed(differenceInSeconds(new Date(), parseISO(entry.start_time)));
    }, 1000);
  }, [stopInterval]);

  // Zeigt den übergebenen Serverstand an (auch „kein Timer")
  const applyActive = useCallback((entry: TimeEntry | null) => {
    if (entry) {
      setActiveEntry(entry);
      setElapsed(differenceInSeconds(new Date(), parseISO(entry.start_time)));
      startInterval(entry);
    } else {
      stopInterval();
      setActiveEntry(null);
      setElapsed(0);
    }
  }, [startInterval, stopInterval]);

  // Serverstand holen und anzeigen; onSync nur bei Wechsel (nicht beim ersten Laden)
  const lastIdRef = useRef<number | null | undefined>(undefined);
  const refresh = useCallback(async (isCancelled: () => boolean = () => false) => {
    lastSyncRef.current = Date.now();
    const entry = await getActiveEntry();
    if (isCancelled()) return;
    const id = entry?.id ?? null;
    const changed = lastIdRef.current !== undefined && id !== lastIdRef.current;
    lastIdRef.current = id;
    applyActive(entry);
    if (changed) onSyncRef.current?.();
  }, [applyActive]);

  // On mount: check for a running timer
  useEffect(() => {
    let cancelled = false;
    refresh(() => cancelled).catch(() => {});
    return () => { cancelled = true; stopInterval(); };
  }, [refresh, stopInterval]);

  // Externe Änderungen übernehmen: Main-Prozess meldet sie per DOM-Event, außerdem
  // beim Zurückkehren ins Fenster (Browser + Electron zeigen denselben Stand)
  useEffect(() => {
    const sync = () => { if (!pendingRef.current) refresh().catch(() => {}); };
    const onFocus = () => { if (Date.now() - lastSyncRef.current > SYNC_MIN_MS) sync(); };
    const onVisible = () => { if (!document.hidden) onFocus(); };
    window.addEventListener('clockitnow:timer-changed', sync);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('clockitnow:timer-changed', sync);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const startTimer = useCallback(async (
    description: string,
    projectId?: number,
    isBillable = true,
    taskId?: number,
  ) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      const entry = await createTimeEntry({
        description: description || undefined,
        project_id: projectId,
        task_id: taskId,
        start_time: new Date().toISOString(),
        is_billable: isBillable ? 1 : 0,
      });
      lastIdRef.current = entry.id;
      applyActive(entry);
    } finally {
      pendingRef.current = false;
    }
  }, [applyActive]);

  const stopTimer = useCallback(async () => {
    if (!activeEntry || pendingRef.current) return;
    pendingRef.current = true;
    try {
      // Wurde der Timer inzwischen extern gestoppt (z. B. rückwirkend bei Inaktivität),
      // darf das Ende nicht mit „jetzt" überschrieben werden
      const current = await getActiveEntry();
      if (!current || current.id !== activeEntry.id) {
        lastIdRef.current = current?.id ?? null;
        applyActive(current);
        onSyncRef.current?.();
        return;
      }
      stopInterval();
      try {
        await updateTimeEntry(activeEntry.id, { end_time: new Date().toISOString() });
      } catch (e) {
        startInterval(activeEntry); // Stopp fehlgeschlagen: Anzeige läuft weiter
        throw e;
      }
      lastIdRef.current = null;
      setActiveEntry(null);
      setElapsed(0);
      onStop?.();
    } finally {
      pendingRef.current = false;
    }
  }, [activeEntry, onStop, applyActive, startInterval, stopInterval]);

  const updateStartTime = useCallback(async (newStartTime: string) => {
    if (!activeEntry) return;
    await updateTimeEntry(activeEntry.id, { start_time: newStartTime });
    const updated = { ...activeEntry, start_time: newStartTime };
    setActiveEntry(updated);
    setElapsed(differenceInSeconds(new Date(), parseISO(newStartTime)));
    startInterval(updated);
  }, [activeEntry, startInterval]);

  return { activeEntry, elapsed, isRunning: !!activeEntry, startTimer, stopTimer, updateStartTime };
}
