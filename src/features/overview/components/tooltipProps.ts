/**
 * Forme minimale des props qu'une infobulle Recharts reçoit. Recharts les type très
 * largement ; on les reprend en `unknown` et on les décode avec `firstPayload`, ce qui
 * évite un `any` tout en restant tolérant aux évolutions de la bibliothèque.
 */
export interface TooltipRenderProps {
  readonly active?: boolean;
  readonly payload?: unknown;
  readonly label?: unknown;
}

/** Une entrée du payload multi-séries (un point par courbe pour l'abscisse survolée). */
export interface SeriesEntry {
  readonly dataKey: string;
  readonly value: number;
  readonly color: string;
}

/** Décode le payload d'un graphique multi-séries en ignorant les entrées inexploitables. */
export function seriesEntries(payload: unknown): readonly SeriesEntry[] {
  if (!Array.isArray(payload)) return [];
  const entries: SeriesEntry[] = [];
  for (const item of payload as readonly unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const { dataKey, value, color } = record;
    if (typeof dataKey !== 'string' || typeof value !== 'number' || !Number.isFinite(value)) continue;
    entries.push({ dataKey, value, color: typeof color === 'string' ? color : '' });
  }
  return entries;
}
