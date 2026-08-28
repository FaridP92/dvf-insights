import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatEurPerSqm, formatInt, formatPct } from '@/lib/format';
import { Card, EmptyState } from '@/shared/ui';
import {
  ChartTooltip,
  axisProps,
  chartColors,
  firstPayload,
  gridProps,
  tooltipCursor,
} from '@/shared/charts';
import type { PriceBin, PriceDistribution } from '../lib/explorerAnalytics';

/**
 * Histogramme du prix au m² avec repères de dispersion.
 * La médiane est tracée en trait plein accentué, P10 et P90 en pointillés gris : trois
 * repères suffisent à situer une valeur sans lire l'axe.
 */

interface TooltipProps {
  readonly active?: boolean;
  readonly payload?: unknown;
}

function DistributionTooltip({ active, payload }: TooltipProps) {
  const bin = firstPayload<PriceBin>(payload);
  if (!active || bin === undefined) return null;
  return (
    <ChartTooltip
      title={`${formatEurPerSqm(bin.x0)} à ${formatEurPerSqm(bin.x1)}`}
      rows={[
        { label: 'Transactions', value: formatInt(bin.count), color: chartColors.accent },
        { label: 'Part de la sélection', value: formatPct(bin.share), muted: true },
      ]}
    />
  );
}

export function PriceDistributionCard({
  distribution,
  height = 260,
  className = '',
}: {
  readonly distribution: PriceDistribution;
  readonly height?: number;
  readonly className?: string;
}) {
  const { bins, stats } = distribution;
  const hasData = bins.length > 0 && stats.count > 0;

  return (
    <Card
      title="Distribution du prix au m²"
      className={className}
      subtitle={
        hasData
          ? `${formatInt(stats.count)} mutations · classes resserrées sur P1-P99`
          : 'Aucune mutation dans la sélection'
      }
    >
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={[...bins]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              {...axisProps}
              dataKey="label"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value: number) => formatInt(Math.round(value))}
              tickCount={6}
            />
            <YAxis {...axisProps} width={44} tickFormatter={(value: number) => formatInt(value)} />
            <Tooltip cursor={tooltipCursor} content={<DistributionTooltip />} />
            <Bar
              dataKey="count"
              fill={chartColors.accent}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
            <ReferenceLine
              x={stats.p10}
              stroke={chartColors.muted}
              strokeDasharray="4 4"
              label={{
                value: 'P10',
                position: 'insideTopLeft',
                fill: chartColors.text,
                fontSize: 10,
              }}
            />
            <ReferenceLine
              x={stats.p90}
              stroke={chartColors.muted}
              strokeDasharray="4 4"
              label={{
                value: 'P90',
                position: 'insideTopRight',
                fill: chartColors.text,
                fontSize: 10,
              }}
            />
            <ReferenceLine
              x={stats.median}
              stroke={chartColors.accent}
              strokeWidth={1.5}
              label={{ value: 'médiane', position: 'top', fill: chartColors.accent, fontSize: 10 }}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState message="Élargissez les filtres pour afficher une distribution." />
      )}
    </Card>
  );
}
