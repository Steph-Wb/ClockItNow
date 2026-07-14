import { useState, useEffect, useCallback, useRef } from 'react';

const FOCUS_RELOAD_MIN_MS = 5_000; // nicht öfter als alle 5 s neu laden

export function useApi<T>(fetchFn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);
  const lastLoadRef = useRef(0);

  const load = useCallback(async () => {
    // Spinner nur beim Erstladen – Fokus-Refreshes laufen still im Hintergrund
    if (!hasDataRef.current) setIsLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
      hasDataRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setIsLoading(false);
      lastLoadRef.current = Date.now();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  // Beim Zurückkehren ins Fenster neu laden: mehrere offene Oberflächen
  // (Browser + Electron) sehen so zeitnah dieselben Daten
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastLoadRef.current > FOCUS_RELOAD_MIN_MS) load();
    };
    const onVisible = () => { if (!document.hidden) onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return { data, isLoading, error, reload: load };
}
