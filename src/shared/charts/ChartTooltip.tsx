import type { ReactNode } from 'react';

export interface TooltipRow {
  readonly label: string;
  readonly value: string;
  readonly color?: string;
  readonly muted?: boolean;
}

/**
 * Infobulle unique pour tous les graphiques : titre, lignes valeur + unité, note de contexte.
 * Recharts fournit `active` et `payload` ; chaque graphique décide de la mise en forme
 * via `render`, qui reçoit le payload typé de la série.
 */
export function ChartTooltip({
  title,
  rows,
  note,
}: {
  readonly title: ReactNode;
  readonly rows: readonly TooltipRow[];
  readonly note?: ReactNode;
}) {
  return (
    <div className="min-w-40 rounded-lg border border-border-strong bg-surface-2/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1.5 font-medium text-fg">{title}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-fg-muted">
              {row.color && <span className="size-2 rounded-sm" style={{ background: row.color }} aria-hidden />}
              {row.label}
            </span>
            <span className={row.muted ? 'tabular text-fg-muted' : 'tabular font-medium text-fg'}>{row.value}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1.5 border-t border-border pt-1.5 text-[11px] text-fg-subtle">{note}</p>}
    </div>
  );
}

/** Extrait de façon sûre la donnée d'origine du premier élément du payload Recharts. */
export function firstPayload<T>(payload: unknown): T | undefined {
  if (!Array.isArray(payload) || payload.length === 0) return undefined;
  const item: unknown = payload[0];
  if (typeof item !== 'object' || item === null || !('payload' in item)) return undefined;
  return (item as { payload: T }).payload;
}
