import { median, medianAbsoluteDeviation } from './descriptive';

export type AnomalyDirection = 'under' | 'over';

export interface Anomaly<T> {
  readonly item: T;
  /** Score z robuste : (x - médiane) / (1,4826 × MAD). */
  readonly score: number;
  readonly direction: AnomalyDirection;
}

/** Facteur de cohérence pour rendre la MAD comparable à un écart-type sous hypothèse normale. */
const MAD_SCALE = 1.4826;

/**
 * Détection d'anomalies par z-score robuste, calculé au sein de chaque groupe
 * (ex : par commune et type de bien) pour ne pas confondre une commune chère avec une anomalie.
 */
export function detectAnomalies<T>(
  items: readonly T[],
  options: {
    readonly value: (item: T) => number;
    readonly groupBy: (item: T) => string;
    readonly threshold?: number;
    readonly minGroupSize?: number;
  },
): readonly Anomaly<T>[] {
  const threshold = options.threshold ?? 3;
  const minGroupSize = options.minGroupSize ?? 8;
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = options.groupBy(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const anomalies: Anomaly<T>[] = [];
  for (const group of groups.values()) {
    if (group.length < minGroupSize) continue;
    const values = group.map(options.value);
    const med = median(values);
    const mad = medianAbsoluteDeviation(values);
    if (!Number.isFinite(mad) || mad === 0) continue;
    group.forEach((item, i) => {
      const score = ((values[i] ?? med) - med) / (MAD_SCALE * mad);
      if (Math.abs(score) >= threshold) {
        anomalies.push({ item, score, direction: score < 0 ? 'under' : 'over' });
      }
    });
  }
  return anomalies.toSorted((a, b) => Math.abs(b.score) - Math.abs(a.score));
}
