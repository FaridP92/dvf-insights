/**
 * Statistiques descriptives robustes.
 * Toutes les fonctions sont pures, sans mutation de l'entrée, et tolèrent les tableaux vides
 * (retour NaN plutôt que crash : l'UI affiche alors un état "donnée indisponible").
 */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Quantile par interpolation linéaire (méthode R-7, identique à numpy par défaut).
 * @param p fraction dans [0, 1]
 */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0 || Number.isNaN(p)) return Number.NaN;
  const clamped = Math.min(1, Math.max(0, p));
  const sorted = values.toSorted((a, b) => a - b);
  const position = (sorted.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower];
  const upperValue = sorted[upper];
  if (lowerValue === undefined || upperValue === undefined) return Number.NaN;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

export const median = (values: readonly number[]): number => quantile(values, 0.5);

export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return Number.NaN;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

/** Median Absolute Deviation, estimateur d'échelle robuste aux valeurs extrêmes. */
export function medianAbsoluteDeviation(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

/** Variation relative entre deux valeurs, NaN si la base est nulle ou invalide. */
export function relativeChange(current: number, previous: number): number {
  if (!Number.isFinite(previous) || previous === 0 || !Number.isFinite(current)) return Number.NaN;
  return (current - previous) / previous;
}

export interface Distribution {
  readonly min: number;
  readonly p10: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly p90: number;
  readonly max: number;
  readonly mean: number;
  readonly count: number;
}

export function describe(values: readonly number[]): Distribution {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    min: sorted[0] ?? Number.NaN,
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? Number.NaN,
    mean: mean(sorted),
    count: sorted.length,
  };
}

/** Histogramme à classes égales. Renvoie les bornes basses et les effectifs. */
export function histogram(
  values: readonly number[],
  bins: number,
  range?: { readonly min: number; readonly max: number },
): ReadonlyArray<{ readonly x0: number; readonly x1: number; readonly count: number }> {
  if (values.length === 0 || bins <= 0) return [];
  const min = range?.min ?? Math.min(...values);
  const max = range?.max ?? Math.max(...values);
  if (max <= min) return [{ x0: min, x1: max, count: values.length }];
  const width = (max - min) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  for (const v of values) {
    if (v < min || v > max) continue;
    const index = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts.map((count, i) => ({ x0: min + i * width, x1: min + (i + 1) * width, count }));
}
