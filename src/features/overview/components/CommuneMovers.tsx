import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatEurPerSqm } from '@/lib/format';
import { tensionLabel } from '@/lib/stats';
import type { CommuneStat } from '@/shared/types/dvf';
import { Badge, EmptyState, Trend, type BadgeTone } from '@/shared/ui';
import type { CommuneMovers as Movers } from '../lib/overviewMetrics';

/** Tonalité du badge de tension : émeraude jusqu'à 5,5, ambre jusqu'à 7,5, rose ensuite. */
function tensionTone(index: number): BadgeTone {
  if (index < 5.5) return 'accent';
  if (index < 7.5) return 'warn';
  return 'danger';
}

function CommuneRow({
  commune,
  departmentName,
}: {
  readonly commune: CommuneStat;
  readonly departmentName: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm text-fg">{commune.communeName}</p>
        <p className="truncate text-xs text-fg-subtle">
          {departmentName} · {formatEurPerSqm(commune.medianPricePerSqm)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Trend value={commune.yoyChange} label="" />
        <Badge tone={tensionTone(commune.tensionIndex)}>{tensionLabel(commune.tensionIndex)}</Badge>
      </div>
    </li>
  );
}

function MoversColumn({
  title,
  icon: Icon,
  accent,
  communes,
  departmentNames,
}: {
  readonly title: string;
  readonly icon: typeof ArrowUpRight;
  readonly accent: string;
  readonly communes: readonly CommuneStat[];
  readonly departmentNames: ReadonlyMap<string, string>;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
        <Icon className={`size-3.5 ${accent}`} aria-hidden />
        {title}
      </p>
      {communes.length === 0 ? (
        <EmptyState message="Aucune commune au seuil de fiabilité." />
      ) : (
        <ul>
          {communes.map((commune) => (
            <CommuneRow
              key={`${commune.inseeCode}-${commune.propertyType}`}
              commune={commune}
              departmentName={departmentNames.get(commune.departmentCode) ?? commune.departmentCode}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Communes en plus forte hausse et en plus forte baisse sur un an, côte à côte. */
export function CommuneMovers({
  movers,
  departmentNames,
}: {
  readonly movers: Movers;
  readonly departmentNames: ReadonlyMap<string, string>;
}) {
  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
      <MoversColumn
        title="Plus fortes hausses"
        icon={ArrowUpRight}
        accent="text-accent"
        communes={movers.risers}
        departmentNames={departmentNames}
      />
      <MoversColumn
        title="Plus fortes baisses"
        icon={ArrowDownRight}
        accent="text-danger"
        communes={movers.fallers}
        departmentNames={departmentNames}
      />
    </div>
  );
}
