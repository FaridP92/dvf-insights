import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEurPerSqm, formatMonth } from '@/lib/format';
import { ChartTooltip, axisProps, chartColors, gridProps, seriesColor, tooltipCursor } from '@/shared/charts';
import type { TooltipRow } from '@/shared/charts';
import { EmptyState, cn } from '@/shared/ui';
import { ALL_FILTER, toBase100, type DepartmentSeries } from '../lib/overviewMetrics';
import { seriesEntries, type TooltipRenderProps } from './tooltipProps';

/** Au delà, l'infobulle devient un tableau : on ne garde que le haut du classement. */
const MAX_TOOLTIP_ROWS = 6;

export interface DepartmentTrack extends DepartmentSeries {
  readonly name: string;
}

/** Clé de recherche du prix médian derrière un point d'indice. */
const priceKey = (month: string, code: string): string => `${month}|${code}`;

function IndexTooltip({
  active,
  payload,
  label,
  names,
  prices,
  selected,
}: TooltipRenderProps & {
  readonly names: ReadonlyMap<string, string>;
  readonly prices: ReadonlyMap<string, number>;
  readonly selected: string;
}) {
  if (active !== true) return null;
  const month = typeof label === 'string' ? label : '';
  const entries = seriesEntries(payload).toSorted((a, b) => b.value - a.value);
  const kept =
    selected === ALL_FILTER
      ? entries.slice(0, MAX_TOOLTIP_ROWS)
      : entries.filter((entry) => entry.dataKey === selected);
  if (kept.length === 0) return null;

  const rows: readonly TooltipRow[] = kept.map((entry) => {
    const price = prices.get(priceKey(month, entry.dataKey));
    return {
      label: names.get(entry.dataKey) ?? entry.dataKey,
      value: `${entry.value.toFixed(1)}${price === undefined ? '' : ` · ${formatEurPerSqm(price)}`}`,
      color: entry.color,
    };
  });

  return (
    <ChartTooltip
      title={formatMonth(month)}
      rows={rows}
      note={
        selected === ALL_FILTER && entries.length > kept.length
          ? `${kept.length} premiers sur ${entries.length} départements`
          : 'Indice base 100 au premier mois'
      }
    />
  );
}

/**
 * Trajectoires comparées des douze départements, chacun ramené à 100 sur le premier mois.
 * Sélectionner un département le met en avant et efface les autres : la comparaison reste
 * lisible sans masquer le contexte.
 */
export function DepartmentIndexChart({
  tracks,
  selected,
  onSelect,
}: {
  readonly tracks: readonly DepartmentTrack[];
  readonly selected: string;
  readonly onSelect: (code: string) => void;
}) {
  const rows = useMemo(() => toBase100(tracks), [tracks]);
  const names = useMemo(
    () => new Map(tracks.map((track) => [track.code, track.name])),
    [tracks],
  );
  const prices = useMemo(() => {
    const map = new Map<string, number>();
    for (const track of tracks) {
      for (const point of track.points) {
        map.set(priceKey(point.month, track.code), point.medianPricePerSqm);
      }
    }
    return map;
  }, [tracks]);

  if (rows.length === 0) return <EmptyState message="Aucune donnée pour ce filtre." />;

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={[...rows]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="month"
            {...axisProps}
            tickFormatter={(value) => formatMonth(String(value))}
            minTickGap={28}
          />
          <YAxis {...axisProps} width={44} domain={['auto', 'auto']} />
          <Tooltip
            cursor={tooltipCursor}
            content={<IndexTooltip names={names} prices={prices} selected={selected} />}
          />
          {tracks.map((track, index) => {
            const highlighted = selected === track.code;
            const dimmed = selected !== ALL_FILTER && !highlighted;
            return (
              <Line
                key={track.code}
                dataKey={track.code}
                type="monotone"
                stroke={
                  highlighted
                    ? chartColors.accent
                    : dimmed
                      ? chartColors.muted
                      : seriesColor(index)
                }
                strokeWidth={highlighted ? 2.4 : 1}
                strokeOpacity={dimmed ? 0.5 : 1}
                dot={false}
                activeDot={dimmed ? false : { r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
        {tracks.map((track, index) => {
          const highlighted = selected === track.code;
          const dimmed = selected !== ALL_FILTER && !highlighted;
          return (
            <li key={track.code}>
              <button
                type="button"
                aria-pressed={highlighted}
                onClick={() => onSelect(highlighted ? ALL_FILTER : track.code)}
                className={cn(
                  'focus-ring inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] transition-colors',
                  highlighted ? 'text-fg' : dimmed ? 'text-fg-subtle' : 'text-fg-muted hover:text-fg',
                )}
              >
                <span
                  className="size-2 rounded-sm"
                  style={{
                    background: highlighted
                      ? chartColors.accent
                      : dimmed
                        ? chartColors.muted
                        : seriesColor(index),
                  }}
                  aria-hidden
                />
                {track.name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
