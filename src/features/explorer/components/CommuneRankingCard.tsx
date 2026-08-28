import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatEurPerSqm, formatInt } from '@/lib/format';
import { Card, EmptyState, cn } from '@/shared/ui';
import { chartColors } from '@/shared/charts';
import type { CommuneRankingRow } from '../lib/explorerAnalytics';

/**
 * Classement des communes de la sélection.
 *
 * Le tri vit dans ce composant et non dans le reducer : il ne change pas la sélection,
 * seulement l'ordre de lecture d'un tableau de quinze lignes. Le mélanger aux filtres
 * ferait recalculer toutes les dérivations pour un simple clic d'en-tête.
 */

type SortKey =
  | 'communeName'
  | 'departmentName'
  | 'transactions'
  | 'medianPricePerSqm'
  | 'p75PricePerSqm'
  | 'medianSurface';

type SortDirection = 'asc' | 'desc';

interface Column {
  readonly key: SortKey;
  readonly label: string;
  readonly numeric: boolean;
  readonly defaultDirection: SortDirection;
}

const COLUMNS: readonly Column[] = [
  { key: 'communeName', label: 'Commune', numeric: false, defaultDirection: 'asc' },
  { key: 'departmentName', label: 'Département', numeric: false, defaultDirection: 'asc' },
  { key: 'transactions', label: 'Transactions', numeric: true, defaultDirection: 'desc' },
  { key: 'medianPricePerSqm', label: 'Prix médian/m²', numeric: true, defaultDirection: 'desc' },
  { key: 'p75PricePerSqm', label: 'Fourchette P25-P75', numeric: true, defaultDirection: 'desc' },
  { key: 'medianSurface', label: 'Surface médiane', numeric: true, defaultDirection: 'desc' },
];

const ARIA_SORT: Record<SortDirection, 'ascending' | 'descending'> = {
  asc: 'ascending',
  desc: 'descending',
};

function compare(a: CommuneRankingRow, b: CommuneRankingRow, key: SortKey): number {
  const left = a[key];
  const right = b[key];
  if (typeof left === 'string' && typeof right === 'string') return left.localeCompare(right, 'fr');
  return Number(left) - Number(right);
}

/** Barre relative P25-P75, positionnée sur l'amplitude commune à tout le tableau. */
function RangeBar({
  row,
  min,
  max,
}: {
  readonly row: CommuneRankingRow;
  readonly min: number;
  readonly max: number;
}) {
  const span = max - min;
  const toPct = (value: number): number =>
    span <= 0 ? 0 : Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const left = toPct(row.p25PricePerSqm);
  const width = Math.max(2, toPct(row.p75PricePerSqm) - left);

  return (
    <div className="flex min-w-40 flex-col gap-1">
      <span className="tabular text-xs text-fg-muted">
        {formatInt(row.p25PricePerSqm)} - {formatInt(row.p75PricePerSqm)}
      </span>
      <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <span
          className="absolute inset-y-0 rounded-full"
          style={{ left: `${left}%`, width: `${width}%`, background: chartColors.accent }}
        />
      </span>
    </div>
  );
}

export function CommuneRankingCard({
  rows,
  subtitle,
  className = '',
}: {
  readonly rows: readonly CommuneRankingRow[];
  readonly subtitle?: string;
  readonly className?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('transactions');
  const [direction, setDirection] = useState<SortDirection>('desc');

  const sorted = useMemo(() => {
    const factor = direction === 'asc' ? 1 : -1;
    return rows.toSorted((a, b) => factor * compare(a, b, sortKey));
  }, [rows, sortKey, direction]);

  const bounds = useMemo(() => {
    const lows = rows.map((r) => r.p25PricePerSqm).filter(Number.isFinite);
    const highs = rows.map((r) => r.p75PricePerSqm).filter(Number.isFinite);
    return lows.length === 0 || highs.length === 0
      ? { min: 0, max: 0 }
      : { min: Math.min(...lows), max: Math.max(...highs) };
  }, [rows]);

  const toggle = (column: Column): void => {
    if (column.key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(column.key);
    setDirection(column.defaultDirection);
  };

  return (
    <Card
      title="Classement des communes"
      subtitle={subtitle ?? 'Les communes les plus actives de la sélection'}
      className={className}
      padded={false}
    >
      {sorted.length === 0 ? (
        <div className="p-5">
          <EmptyState message="Aucune commune ne correspond aux filtres." />
        </div>
      ) : (
        <div className="max-h-[26rem] overflow-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <caption className="sr-only">
              Communes classées par volume de mutations, avec prix médian au mètre carré et
              dispersion interquartile
            </caption>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                {COLUMNS.map((column) => {
                  const active = column.key === sortKey;
                  const Icon = direction === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={active ? ARIA_SORT[direction] : 'none'}
                      className={cn(
                        'px-4 py-2.5 text-xs font-medium text-fg-muted',
                        column.numeric ? 'text-right' : 'text-left',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(column)}
                        aria-label={`Trier par ${column.label}`}
                        className={cn(
                          'focus-ring inline-flex items-center gap-1 rounded transition-colors hover:text-fg',
                          column.numeric && 'flex-row-reverse',
                          active && 'text-fg',
                        )}
                      >
                        {column.label}
                        <Icon
                          className={cn('size-3', active ? 'opacity-100' : 'opacity-0')}
                          aria-hidden
                        />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.inseeCode}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-2.5 font-medium text-fg">{row.communeName}</td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    <span className="tabular text-fg-subtle">{row.departmentCode}</span>{' '}
                    {row.departmentName}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-fg">
                    {formatInt(row.transactions)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-fg">
                    {formatEurPerSqm(row.medianPricePerSqm)}
                  </td>
                  <td className="px-4 py-2.5">
                    <RangeBar row={row} min={bounds.min} max={bounds.max} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-fg-muted">
                    {formatInt(Math.round(row.medianSurface))} m²
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
