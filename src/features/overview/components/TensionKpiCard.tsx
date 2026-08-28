import { Gauge } from 'lucide-react';
import { cn } from '@/shared/ui';

/** Bornes de lecture de l'indice, alignées sur `tensionLabel`. */
const WARN_THRESHOLD = 5.5;
const DANGER_THRESHOLD = 7.5;
const MAX_INDEX = 10;

/**
 * Carte KPI de l'indice de tension. Elle reprend la mise en page de `KpiCard` mais
 * remplace la sparkline par une jauge : un indice borné se lit sur une échelle, pas
 * sur une trajectoire.
 */
export function TensionKpiCard({
  value,
  label,
}: {
  readonly value: number;
  readonly label: string;
}) {
  const safe = Number.isFinite(value) ? Math.min(MAX_INDEX, Math.max(0, value)) : 0;
  const tone =
    safe < WARN_THRESHOLD ? 'bg-accent' : safe < DANGER_THRESHOLD ? 'bg-warn' : 'bg-danger';
  const text =
    safe < WARN_THRESHOLD ? 'text-accent' : safe < DANGER_THRESHOLD ? 'text-warn' : 'text-danger';

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          Indice de tension
        </p>
        <Gauge className="size-4 text-fg-subtle" aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular text-fg">
        {safe.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        <span className="ml-1 text-sm font-normal text-fg-subtle">/ 10</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span className={cn('text-xs font-medium capitalize', text)}>{label}</span>
      </div>
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label="Indice de tension sur 10"
        aria-valuenow={Math.round(safe * 10) / 10}
        aria-valuemin={0}
        aria-valuemax={MAX_INDEX}
      >
        <div
          className={cn('h-full rounded-full transition-all', tone)}
          style={{ width: `${(safe / MAX_INDEX) * 100}%` }}
        />
      </div>
    </div>
  );
}
