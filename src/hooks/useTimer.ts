import { useState, useEffect, useRef, useCallback } from 'react';
import { differenceInSeconds, parseISO } from 'date-fns';
import { getActiveEntry, createTimeEntry, updateTimeEntry } from '../api';
import type { TimeEntry } from '../types';

export function useTimer(onStop?: () => void) {
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guard gegen Doppelklick: verhindert zwei parallele Start-/Stop-Requests
  const pendingRef = useRef(false);

  const startInterval = useCallback((entry: TimeEntry) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setElapsed(differenceInSeconds(new Date(), parseISO(entry.start_time)));
    }, 1000);
  }, []);

  // On mount: check for a running timer
  useEffect(() => {
    getActiveEntry().then(entry => {
      if (entry) {
        setActiveEntry(entry);
        setElapsed(differenceInSeconds(new Date(), parseISO(entry.start_time)));
        startInterval(entry);
      }
    }).catch(() => {});
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startInterval]);

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
      setActiveEntry(entry);
      setElapsed(0);
      startInterval(entry);
    } finally {
      pendingRef.current = false;
    }
  }, [startInterval]);

  const stopTimer = useCallback(async () => {
    if (!activeEntry || pendingRef.current) return;
    pendingRef.current = true;
    try {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      await updateTimeEntry(activeEntry.id, { end_time: new Date().toISOString() });
      setActiveEntry(null);
      setElapsed(0);
      onStop?.();
    } finally {
      pendingRef.current = false;
    }
  }, [activeEntry, onStop]);

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
