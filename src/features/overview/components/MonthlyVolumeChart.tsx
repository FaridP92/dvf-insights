import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatInt, formatMonth, formatPct } from '@/lib/format';
import { relativeChange } from '@/lib/stats';
import { ChartTooltip, axisProps, chartColors, firstPayload, gridProps } from '@/shared/charts';
import { EmptyState } from '@/shared/ui';
import type { MonthlyPoint } from '../lib/overviewMetrics';
import type { TooltipRenderProps } from './tooltipProps';

const RECENT_MONTHS = 12;

interface VolumeRow {
  readonly month: string;
  readonly transactions: number;
  /** Variation par rapport au même mois de l'année précédente, NaN si hors série. */
  readonly yoyChange: number;
  /** Les douze derniers mois sont pleins, l'historique est estompé. */
  readonly recent: boolean;
}

function VolumeTooltip({ active, payload }: TooltipRenderProps) {
  const row = firstPayload<VolumeRow>(payload);
  if (active !== true || row === undefined) return null;
  return (
    <ChartTooltip
      title={formatMonth(row.month)}
      rows={[
        { label: 'Transactions', value: formatInt(row.transactions), color: chartColors.accent },
        {
          label: 'Variation N-1',
          value: Number.isFinite(row.yoyChange) ? formatPct(row.yoyChange) : 'n/d',
          muted: true,
        },
      ]}
    />
  );
}

/** Volume mensuel sur 36 mois, les 12 derniers mois mis en avant. */
export function MonthlyVolumeChart({ series }: { readonly series: readonly MonthlyPoint[] }) {
  const rows = useMemo(
    () =>
      series.map((point, index): VolumeRow => {
        const lastYear = series[index - RECENT_MONTHS];
        return {
          month: point.month,
          transactions: point.transactions,
          yoyChange:
            lastYear === undefined
              ? Number.NaN
              : relativeChange(point.transactions, lastYear.transactions),
          recent: index >= series.length - RECENT_MONTHS,
        };
      }),
    [series],
  );

  if (rows.length === 0) return <EmptyState message="Aucune donnée pour ce filtre." />;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={[...rows]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="month"
          {...axisProps}
          tickFormatter={(value) => formatMonth(String(value))}
          minTickGap={28}
        />
        <YAxis {...axisProps} width={48} tickFormatter={(value) => formatInt(Number(value))} />
        <Tooltip cursor={{ fill: chartColors.grid, fillOpacity: 0.5 }} content={<VolumeTooltip />} />
        <Bar dataKey="transactions" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell
              key={row.month}
              fill={chartColors.accent}
              fillOpacity={row.recent ? 0.95 : 0.32}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
