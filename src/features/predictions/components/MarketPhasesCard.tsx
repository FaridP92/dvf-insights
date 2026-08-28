import { useMemo } from 'react';
import {
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { formatPct } from '@/lib/format';
import type { MonthlyStat } from '@/shared/types/dvf';
import {
  ChartTooltip,
  axisProps,
  chartColors,
  firstPayload,
  gridProps,
  tooltipCursor,
} from '@/shared/charts';
import { Card, ChartSkeleton, EmptyState, ErrorState } from '@/shared/ui';
import {
  type DepartmentMomentum,
  type MarketPhase,
  momentumByDepartment,
} from '../lib/predictionEngine';
import type { Query } from './query';

const CHART_HEIGHT = 320;

const PHASE_COLOR: Readonly<Record<MarketPhase, string>> = {
  expansion: chartColors.accent,
  surchauffe: chartColors.warn,
  correction: chartColors.danger,
  reprise: chartColors.info,
};

const PHASE_LABEL: Readonly<Record<MarketPhase, string>> = {
  expansion: 'Expansion',
  surchauffe: 'Surchauffe',
  correction: 'Correction',
  reprise: 'Reprise',
};

/** Une phrase par quadrant : la légende sert à lire le graphique, pas à le nommer. */
const PHASE_HINT: Readonly<Record<MarketPhase, string>> = {
  expansion: 'Prix et volumes montent ensemble : marché porteur, offre absorbée.',
  surchauffe: 'Prix en forte hausse mais volumes en repli : les acheteurs décrochent.',
  correction: 'Prix et volumes reculent : ajustement en cours, vendeurs attentistes.',
  reprise: 'Volumes repartent avant les prix : signal avancé de retournement.',
};

const PHASE_ORDER: readonly MarketPhase[] = ['expansion', 'surchauffe', 'correction', 'reprise'];

function PhaseTooltip({
  active,
  payload,
}: {
  readonly active?: boolean;
  readonly payload?: unknown;
}) {
  if (active !== true) return null;
  const point = firstPayload<DepartmentMomentum>(payload);
  if (point === undefined) return null;
  return (
    <ChartTooltip
      title={`${point.departmentCode} · ${point.departmentName}`}
      rows={[
        {
          label: 'Prix médian au m²',
          value: formatPct(point.priceChange),
          color: PHASE_COLOR[point.phase],
        },
        { label: 'Volume de ventes', value: formatPct(point.volumeChange), muted: true },
      ]}
      note={`${PHASE_LABEL[point.phase]} · 12 derniers mois contre les 12 précédents`}
    />
  );
}

/**
 * Quadrants prix × volume par département.
 *
 * Le volume décroche avant les prix : croiser les deux axes situe chaque marché dans
 * son cycle, là où une courbe de prix seule montrerait douze marchés identiques.
 */
export function MarketPhasesCard({
  monthly,
  className,
}: {
  readonly monthly: Query<readonly MonthlyStat[]>;
  readonly className?: string;
}) {
  const rows = useMemo(() => momentumByDepartment(monthly.data ?? []), [monthly.data]);

  return (
    <Card
      title="Phases de marché par département"
      subtitle="Variation du volume en abscisse, variation du prix en ordonnée, sur 12 mois glissants"
      className={className ?? ''}
    >
      {monthly.status === 'error' ? (
        <ErrorState error={monthly.error} onRetry={monthly.refetch} />
      ) : monthly.status === 'loading' ? (
        <ChartSkeleton height={CHART_HEIGHT} />
      ) : rows.length === 0 ? (
        <EmptyState message="Historique insuffisant pour situer les départements." />
      ) : (
        <div className="flex flex-col gap-4">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                type="number"
                dataKey="volumeChange"
                {...axisProps}
                tickFormatter={formatPct}
                domain={['dataMin', 'dataMax']}
                name="Variation du volume"
              />
              <YAxis
                type="number"
                dataKey="priceChange"
                {...axisProps}
                width={56}
                tickFormatter={formatPct}
                domain={['dataMin', 'dataMax']}
                name="Variation du prix"
              />
              <ZAxis range={[90, 90]} />
              <ReferenceLine x={0} stroke={chartColors.axis} strokeDasharray="4 4" />
              <ReferenceLine y={0} stroke={chartColors.axis} strokeDasharray="4 4" />
              <Tooltip cursor={tooltipCursor} content={<PhaseTooltip />} />
              <Scatter data={[...rows]} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.departmentCode} fill={PHASE_COLOR[row.phase]} />
                ))}
                <LabelList
                  dataKey="departmentCode"
                  position="top"
                  fill={chartColors.text}
                  fontSize={10}
                />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          <ul className="grid gap-2 sm:grid-cols-2">
            {PHASE_ORDER.map((phase) => (
              <li key={phase} className="flex items-start gap-2 text-xs">
                <span
                  className="mt-1 size-2 shrink-0 rounded-sm"
                  style={{ background: PHASE_COLOR[phase] }}
                  aria-hidden
                />
                <span>
                  <span className="font-medium text-fg">{PHASE_LABEL[phase]}</span>
                  <span className="text-fg-subtle"> · {PHASE_HINT[phase]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
