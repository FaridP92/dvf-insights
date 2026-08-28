import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEurPerSqm, formatMonth } from '@/lib/format';
import { ChartTooltip, axisProps, chartColors, gridProps, seriesColor, tooltipCursor } from '@/shared/charts';
import type { TooltipRow } from '@/shared/charts';
import { EmptyState } from '@/shared/ui';
import { pickRegionHighlights, smoothBase100, toBase100, type IndexSeries } from '../lib/overviewMetrics';
import { seriesEntries, type TooltipRenderProps } from './tooltipProps';

/** Fenêtre de lissage : trois mois effacent la saisonnalité sans masquer les retournements. */
const SMOOTHING_WINDOW = 3;

const priceKey = (month: string, code: string): string => `${month}|${code}`;

function IndexTooltip({
  active,
  payload,
  label,
  names,
  prices,
  colors,
}: TooltipRenderProps & {
  readonly names: ReadonlyMap<string, string>;
  readonly prices: ReadonlyMap<string, number>;
  readonly colors: ReadonlyMap<string, string>;
}) {
  if (active !== true) return null;
  const month = typeof label === 'string' ? label : '';
  const entries = seriesEntries(payload).toSorted((a, b) => b.value - a.value);
  if (entries.length === 0) return null;

  // Seules les séries colorées sont détaillées : la trame grise n'est là que pour le contexte.
  const kept = entries.filter((entry) => colors.has(entry.dataKey));
  const rows: readonly TooltipRow[] = kept.map((entry) => {
    const price = prices.get(priceKey(month, entry.dataKey));
    return {
      label: names.get(entry.dataKey) ?? entry.dataKey,
      value: `${entry.value.toFixed(1)}${price === undefined ? '' : ` · ${formatEurPerSqm(price)}`}`,
      color: colors.get(entry.dataKey) ?? chartColors.muted,
    };
  });

  return (
    <ChartTooltip
      title={formatMonth(month)}
      rows={rows}
      note={`Indice base 100, lissé sur ${SMOOTHING_WINDOW} mois · ${entries.length} régions`}
    />
  );
}

/**
 * Trajectoires comparées en base 100, une courbe par région métropolitaine, lissées sur
 * trois mois. Seules les deux régions les plus dynamiques et les deux plus faibles sont en
 * couleur ; les autres forment une trame grise. Le département sélectionné se superpose en
 * accent : la question utile est de savoir s'il suit sa région ou s'en écarte.
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
  const rows = useMemo(() => smoothBase100(toBase100(tracks), SMOOTHING_WINDOW), [tracks]);
  const highlightedCode = highlight?.code ?? null;

  const colors = useMemo(() => {
    const map = new Map<string, string>();
    const picked = pickRegionHighlights(
      rows,
      regions.map((region) => region.code),
    );
    picked.forEach((code, index) => map.set(code, seriesColor(index + 1)));
    if (highlightedCode !== null) map.set(highlightedCode, chartColors.accent);
    return map;
  }, [rows, regions, highlightedCode]);

  const names = useMemo(() => new Map(tracks.map((track) => [track.code, track.name])), [tracks]);
  const prices = useMemo(() => {
    const map = new Map<string, number>();
    for (const track of tracks) {
      for (const point of track.points) map.set(priceKey(point.month, track.code), point.medianPricePerSqm);
    }
    return map;
  }, [tracks]);

  if (rows.length === 0) return <EmptyState message="Aucune donnée pour ce filtre." />;

  const last = rows.at(-1);
  const legend = tracks
    .filter((track) => colors.has(track.code))
    .map((track) => ({
      code: track.code,
      name: track.name,
      color: colors.get(track.code) ?? chartColors.muted,
      value: typeof last?.[track.code] === 'number' ? (last[track.code] as number) : undefined,
    }))
    .toSorted((a, b) => (b.value ?? 0) - (a.value ?? 0));

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
          <Tooltip cursor={tooltipCursor} content={<IndexTooltip names={names} prices={prices} colors={colors} />} />
          {tracks.map((track) => {
            const color = colors.get(track.code);
            const accented = track.code === highlightedCode;
            return (
              <Line
                key={track.code}
                dataKey={track.code}
                type="monotone"
                stroke={color ?? chartColors.muted}
                strokeWidth={accented ? 2.6 : color === undefined ? 1 : 1.8}
                strokeOpacity={color === undefined ? 0.35 : 1}
                dot={false}
                activeDot={color === undefined ? false : { r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
        {legend.map((item) => (
          <li
            key={item.code}
            className={`inline-flex items-center gap-1.5 ${item.code === highlightedCode ? 'font-medium text-fg' : 'text-fg-muted'}`}
          >
            <span className="size-2 rounded-sm" style={{ background: item.color }} aria-hidden />
            {item.name}
            {item.value !== undefined && <span className="tabular text-fg-subtle">{item.value.toFixed(1)}</span>}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5 text-fg-subtle">
          <span className="size-2 rounded-sm" style={{ background: chartColors.muted, opacity: 0.5 }} aria-hidden />
          Autres régions métropolitaines
        </li>
      </ul>
    </div>
  );
}
