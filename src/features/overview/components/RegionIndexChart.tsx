import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEurPerSqm, formatMonth } from '@/lib/format';
import { ChartTooltip, axisProps, chartColors, gridProps, tooltipCursor } from '@/shared/charts';
import type { TooltipRow } from '@/shared/charts';
import { EmptyState } from '@/shared/ui';
import { toBase100, type IndexSeries } from '../lib/overviewMetrics';
import { seriesEntries, type TooltipRenderProps } from './tooltipProps';

/** Au delà, l'infobulle devient un tableau : on ne garde que le haut du classement. */
const MAX_TOOLTIP_ROWS = 6;

/** Clé de recherche du prix médian derrière un point d'indice. */
const priceKey = (month: string, code: string): string => `${month}|${code}`;

function IndexTooltip({
  active,
  payload,
  label,
  names,
  prices,
  highlighted,
}: TooltipRenderProps & {
  readonly names: ReadonlyMap<string, string>;
  readonly prices: ReadonlyMap<string, number>;
  readonly highlighted: string | null;
}) {
  if (active !== true) return null;
  const month = typeof label === 'string' ? label : '';
  const entries = seriesEntries(payload).toSorted((a, b) => b.value - a.value);
  if (entries.length === 0) return null;

  // Le département mis en avant reste visible même s'il n'est pas dans le haut du classement.
  const top = entries.filter((entry) => entry.dataKey !== highlighted).slice(0, MAX_TOOLTIP_ROWS);
  const pinned = entries.filter((entry) => entry.dataKey === highlighted);
  const kept = [...pinned, ...top];

  const rows: readonly TooltipRow[] = kept.map((entry) => {
    const price = prices.get(priceKey(month, entry.dataKey));
    return {
      label: names.get(entry.dataKey) ?? entry.dataKey,
      value: `${entry.value.toFixed(1)}${price === undefined ? '' : ` · ${formatEurPerSqm(price)}`}`,
      color: entry.color,
      muted: entry.dataKey !== highlighted && highlighted !== null,
    };
  });

  return (
    <ChartTooltip
      title={formatMonth(month)}
      rows={rows}
      note={
        entries.length > kept.length
          ? `${kept.length} lignes sur ${entries.length} territoires`
          : 'Indice base 100 au premier mois'
      }
    />
  );
}

/**
 * Trajectoires comparées en base 100, une courbe par région.
 *
 * À l'échelle nationale, comparer quatre-vingt-dix-sept départements sur un même axe ne
 * produit qu'un enchevêtrement. Les régions donnent la trame du territoire en une quinzaine
 * de courbes grises ; le département sélectionné s'y superpose en accent, ce qui répond à
 * la seule question utile : mon territoire suit-il sa région ou s'en écarte-t-il ?
 */
export function RegionIndexChart({
  regions,
  highlight,
}: {
  readonly regions: readonly IndexSeries[];
  readonly highlight: IndexSeries | null;
}) {
  const tracks = useMemo(
    () => (highlight === null ? regions : [...regions, highlight]),
    [regions, highlight],
  );
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

  const highlightedCode = highlight?.code ?? null;

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
            content={<IndexTooltip names={names} prices={prices} highlighted={highlightedCode} />}
          />
          {tracks.map((track) => {
            const accented = track.code === highlightedCode;
            return (
              <Line
                key={track.code}
                dataKey={track.code}
                type="monotone"
                stroke={accented ? chartColors.accent : chartColors.muted}
                strokeWidth={accented ? 2.4 : 1}
                strokeOpacity={accented ? 1 : 0.55}
                dot={false}
                activeDot={accented ? { r: 3, strokeWidth: 0 } : false}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
        {tracks.map((track) => {
          const accented = track.code === highlightedCode;
          return (
            <li
              key={track.code}
              className={`inline-flex items-center gap-1.5 ${accented ? 'font-medium text-fg' : 'text-fg-subtle'}`}
            >
              <span
                className="size-2 rounded-sm"
                style={{ background: accented ? chartColors.accent : chartColors.muted }}
                aria-hidden
              />
              {track.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
