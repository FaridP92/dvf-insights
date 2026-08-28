import { mean, standardDeviation } from './descriptive';

/** Coefficient de corrélation de Pearson. NaN si variance nulle ou tailles différentes. */
export function pearson(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length || x.length < 2) return Number.NaN;
  const mx = mean(x);
  const my = mean(y);
  const sx = standardDeviation(x);
  const sy = standardDeviation(y);
  if (sx === 0 || sy === 0 || Number.isNaN(sx) || Number.isNaN(sy)) return Number.NaN;
  let cov = 0;
  for (let i = 0; i < x.length; i += 1) {
    cov += ((x[i] ?? 0) - mx) * ((y[i] ?? 0) - my);
  }
  return cov / ((x.length - 1) * sx * sy);
}

export interface CorrelationCell {
  readonly row: string;
  readonly col: string;
  readonly value: number;
}

/**
 * Matrice de corrélation pour un jeu de variables nommées.
 * Renvoie une liste plate de cellules, format directement consommable par une heatmap.
 */
export function correlationMatrix(
  variables: Readonly<Record<string, readonly number[]>>,
): readonly CorrelationCell[] {
  const names = Object.keys(variables);
  const cells: CorrelationCell[] = [];
  for (const row of names) {
    for (const col of names) {
      const value = row === col ? 1 : pearson(variables[row] ?? [], variables[col] ?? []);
      cells.push({ row, col, value });
    }
  }
  return cells;
}
