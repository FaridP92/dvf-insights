import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompact, formatEurPerSqm, formatMonth } from '@/lib/format';
import { findDepartment } from '@/shared/mocks/departments';
import type { MonthlyStat } from '@/shared/types/dvf';
import {
  ChartTooltip,
  axisProps,
  chartColors,
  firstPayload,
  gridProps,
  tooltipCursor,
} from '@/shared/charts';
import { Card, ChartSkeleton, EmptyState, ErrorState, Segmented, Select, Trend } from '@/shared/ui';
import { ALL, type ForecastSeriesPoint, type TypeFilter, buildForecast } from '../lib/predictionEngine';
import { formatPlusMinus, formatTrendPerMonth } from '../lib/display';
import type { Query } from './query';

const HORIZON = 12;
const CHART_HEIGHT = 300;

const TYPE_OPTIONS: ReadonlyArray<{ readonly value: TypeFilter; readonly label: string }> = [
  { value: ALL, label: 'Tous' },
  { value: 'appartement', label: 'Appartement' },
  { value: 'maison', label: 'Maison' },
];

/** Point du graphique : la bande d'incertitude est une paire [bas, haut] pour Recharts. */
type ChartPoint = ForecastSeriesPoint & { readonly band?: readonly [number, number] };

function ForecastTooltip({
  active,
  payload,
  label,
}: {
  readonly active?: boolean;
  readonly payload?: unknown;
  readonly label?: unknown;
}) {
  if (active !== true) return null;
  const point = firstPayload<ChartPoint>(payload);
  if (point === undefined) return null;

  const title = formatMonth(typeof label === 'string' ? label : point.month);
  if (point.kind === 'history') {
    return (
      <ChartTooltip
        title={title}
        rows={[
          {
            label: 'Prix médian réel',
            value: point.actual === undefined ? 'n/d' : formatEurPerSqm(point.actual),
            color: chartColors.accent,
          },
          {
            label: 'Ajusté par le modèle',
            value: point.fitted === undefined ? 'n/d' : formatEurPerSqm(point.fitted),
            color: chartColors.muted,
            muted: true,
          },
        ]}
        note="Série observée, agrégée au prorata des volumes"
      />
    );
  }
  return (
    <ChartTooltip
      title={title}
      rows={[
        {
          label: 'Prévision',
          value: point.forecast === undefined ? 'n/d' : formatEurPerSqm(point.forecast),
          color: chartColors.accent,
        },
        {
          label: 'Fourchette',
          value:
            point.low === undefined || point.high === undefined
              ? 'n/d'
              : `${formatEurPerSqm(point.low)} - ${formatEurPerSqm(point.high)}`,
          muted: true,
        },
      ]}
      note="Lissage de Holt, intervalle ≈ 80 %"
    />
  );
}

function MiniKpi({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <div className="mt-1.5 flex items-center">{children}</div>
    </div>
  );
}

/**
 * Prévision à douze mois du prix médian au m².
 *
 * Le passé et le futur partagent un axe unique : c'est le seul moyen de montrer que
 * l'incertitude s'élargit, et où s'arrête l'observation. La ligne verticale marque
 * la frontière, la bande la couvre.
 */
export function ForecastCard({
  monthly,
  className,
}: {
  readonly monthly: Query<readonly MonthlyStat[]>;
  readonly className?: string;
}) {
  const [department, setDepartment] = useState('75');
  const [propertyType, setPropertyType] = useState<TypeFilter>(ALL);

  const monthlyStats = monthly.data;

  const departmentOptions = useMemo(() => {
    const codes = [...new Set((monthlyStats ?? []).map((row) => row.departmentCode))].toSorted();
    return [
      { value: ALL, label: 'Tous les départements' },
      ...codes.map((code) => ({
        value: code,
        label: `${code} · ${findDepartment(code)?.name ?? 'Département'}`,
      })),
    ];
  }, [monthlyStats]);

  const { points, summary } = useMemo(
    () => buildForecast(monthlyStats ?? [], { department, propertyType }, HORIZON),
    [monthlyStats, department, propertyType],
  );

  const chartData = useMemo<readonly ChartPoint[]>(
    () =>
      points.map((point) =>
        point.low === undefined || point.high === undefined
          ? point
          : { ...point, band: [point.low, point.high] as const },
      ),
    [points],
  );

  const activeDepartment = departmentOptions.some((option) => option.value === department)
    ? department
    : ALL;

  return (
    <Card
      title="Prévision 12 mois"
      subtitle="Prix médian au m², lissage exponentiel de Holt et bande d'incertitude"
      className={className ?? ''}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={activeDepartment}
            onChange={setDepartment}
            options={departmentOptions}
            ariaLabel="Département de la prévision"
          />
          <Segmented
            value={propertyType}
            onChange={setPropertyType}
            options={TYPE_OPTIONS}
            ariaLabel="Type de bien de la prévision"
          />
        </div>
      }
    >
      {monthly.status === 'error' ? (
        <ErrorState error={monthly.error} onRetry={monthly.refetch} />
      ) : monthly.status === 'loading' ? (
        <ChartSkeleton height={CHART_HEIGHT} />
      ) : chartData.length === 0 ? (
        <EmptyState message="Historique insuffisant pour projeter cette série." />
      ) : (
        <div className="flex flex-col gap-4">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart data={[...chartData]} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="month"
                {...axisProps}
                tickFormatter={formatMonth}
                minTickGap={28}
                interval="preserveStartEnd"
              />
              <YAxis
                {...axisProps}
                width={52}
                domain={['auto', 'auto']}
                tickFormatter={(value: number) => formatCompact(value)}
              />
              <Tooltip cursor={tooltipCursor} content={<ForecastTooltip />} />
              <Area
                dataKey="band"
                stroke="none"
                fill={chartColors.accent}
                fillOpacity={0.12}
                isAnimationActive={false}
                connectNulls={false}
                activeDot={false}
              />
              <Line
                dataKey="fitted"
                stroke={chartColors.muted}
                strokeWidth={1.25}
                strokeDasharray="2 3"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Line
                dataKey="actual"
                stroke={chartColors.accent}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Line
                dataKey="forecast"
                stroke={chartColors.accent}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
              <ReferenceLine
                x={summary.lastActualMonth}
                stroke={chartColors.muted}
                strokeDasharray="3 3"
                label={{
                  value: "aujourd'hui",
                  position: 'insideTopRight',
                  fill: chartColors.text,
                  fontSize: 11,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="grid gap-3 sm:grid-cols-3">
            <MiniKpi label="Variation projetée">
              <Trend value={summary.projectedChange} label="sur 12 mois" />
            </MiniKpi>
            <MiniKpi label="Tendance mensuelle">
              <span className="text-sm font-medium tabular text-fg">
                {formatTrendPerMonth(summary.monthlyTrend)}
              </span>
            </MiniKpi>
            <MiniKpi label="Incertitude à 12 mois">
              <span className="text-sm font-medium tabular text-fg">
                {formatPlusMinus(summary.intervalWidth / 2)}
              </span>
            </MiniKpi>
          </div>
        </div>
      )}
    </Card>
  );
}
