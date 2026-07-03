export type RoundingMode = 'up' | 'down';

export interface RoundingRule {
  stepMinutes: 5 | 10 | 15;
  mode: RoundingMode;
}

export const ROUNDING_STEPS = [5, 10, 15] as const;
export const DEFAULT_ROUNDING: RoundingRule = { stepMinutes: 15, mode: 'up' };

/** Validiert Kundenwerte aus der DB/dem Request; Unbekanntes fällt auf den Default zurück. */
export function normalizeRoundingRule(stepMinutes: unknown, mode: unknown): RoundingRule {
  const step = ROUNDING_STEPS.includes(Number(stepMinutes) as 5 | 10 | 15)
    ? (Number(stepMinutes) as 5 | 10 | 15)
    : DEFAULT_ROUNDING.stepMinutes;
  const m: RoundingMode = mode === 'down' ? 'down' : mode === 'up' ? 'up' : DEFAULT_ROUNDING.mode;
  return { stepMinutes: step, mode: m };
}

const EPS = 1e-6;

/**
 * Rundet Dauern (Sekunden) aufs Raster – mit Deckelung der Gesamtsumme
 * (Largest-Remainder-Verfahren):
 *
 * 1. Jede Zeile wird nach der Regel gerundet (auf oder ab, aufs Raster).
 * 2. Nur bei 'up' nötig: Solange Summe(gerundet) − Summe(exakt) größer als
 *    EIN Raster ist, wird die Zeile mit dem größten Rundungsgewinn
 *    (gerundet − exakt) auf ihr Abrunden-Ergebnis zurückgestuft. Jede
 *    Rückstufung senkt den Überschuss um genau ein Raster → terminiert
 *    garantiert mit Überschuss ≤ Raster.
 *
 * Bei 'down' kann die Summe nie überschreiten; es wird nichts korrigiert.
 * Jede Zeile ist am Ende entweder ihr Auf- oder ihr Abrundungswert –
 * es entstehen keine „erfundenen“ Zwischenwerte.
 */
export function roundDurationsCapped(rawSeconds: number[], rule: RoundingRule): number[] {
  const step = rule.stepMinutes * 60;
  const floor = rawSeconds.map(s => Math.floor(s / step + EPS) * step);
  const ceil = rawSeconds.map(s => Math.ceil(s / step - EPS) * step);
  const values = rule.mode === 'up' ? [...ceil] : [...floor];

  if (rule.mode === 'up') {
    const rawTotal = rawSeconds.reduce((a, b) => a + b, 0);
    let excess = values.reduce((a, b) => a + b, 0) - rawTotal;
    while (excess > step + EPS) {
      // Zeile mit dem größten Rundungsgewinn zurückstufen (deterministisch:
      // bei Gleichstand die erste); Zeilen auf dem Raster haben Gewinn 0.
      let best = -1;
      let bestGain = EPS;
      for (let i = 0; i < values.length; i++) {
        const gain = values[i] - rawSeconds[i];
        if (values[i] > floor[i] + EPS && gain > bestGain) { best = i; bestGain = gain; }
      }
      if (best < 0) break; // Sicherheitsnetz – rechnerisch nicht erreichbar
      values[best] = floor[best];
      excess -= step;
    }
  }
  return values;
}
