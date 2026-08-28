import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEurPerSqm, formatInt, formatMonth } from '@/lib/format';
import { ChartTooltip, axisProps, chartColors, firstPayload, gridProps, tooltipCursor } from '@/shared/charts';
import { EmptyState } from '@/shared/ui';
import type { MonthlyPoint } from '../lib/overviewMetrics';
import type { TooltipRenderProps } from './tooltipProps';

interface DispersionRow {
  readonly month: string;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
  /** Recharts trace une bande d'aire quand la valeur est un couple [bas, haut]. */
  readonly band: readonly [number, number];
  readonly transactions: number;
}

function DispersionTooltip({ active, payload }: TooltipRenderProps) {
  const row = firstPayload<DispersionRow>(payload);
  if (active !== true || row === undefined) return null;
  return (
    <ChartTooltip
      title={formatMonth(row.month)}
      rows={[
        { label: 'Médiane', value: formatEurPerSqm(row.median), color: chartColors.accent },
        { label: 'P90 (haut de marché)', value: formatEurPerSqm(row.p90), muted: true },
        { label: 'P10 (entrée de gamme)', value: formatEurPerSqm(row.p10), muted: true },
      ]}
      note={`${formatInt(row.transactions)} transactions ce mois-là`}
    />
  );
}

/** Prix médian au m² et bande interdécile, sur 36 mois. */
export function PriceDispersionChart({ series }: { readonly series: readonly MonthlyPoint[] }) {
  const rows = useMemo(
    () =>
      series.map(
        (point): DispersionRow => ({
          month: point.month,
          median: Math.round(point.medianPricePerSqm),
          p10: Math.round(point.p10PricePerSqm),
          p90: Math.round(point.p90PricePerSqm),
          band: [Math.round(point.p10PricePerSqm), Math.round(point.p90PricePerSqm)],
          transactions: point.transactions,
        }),
      ),
    [series],
  );

  if (rows.length === 0) return <EmptyState message="Aucune donnée pour ce filtre." />;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={[...rows]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="month"
          {...axisProps}
          tickFormatter={(value) => formatMonth(String(value))}
          minTickGap={28}
        />
        <YAxis
          {...axisProps}
          width={56}
          domain={['auto', 'auto']}
          tickFormatter={(value) => formatInt(Number(value))}
        />
        <Tooltip cursor={tooltipCursor} content={<DispersionTooltip />} />
        <Area
          dataKey="band"
          stroke="none"
          fill={chartColors.muted}
          fillOpacity={0.18}
          isAnimationActive={false}
          activeDot={false}
        />
        <Line
          dataKey="median"
          type="monotone"
          stroke={chartColors.accent}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
