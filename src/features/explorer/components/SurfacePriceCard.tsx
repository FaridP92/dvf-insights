import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { formatCompact, formatEur, formatEurPerSqm, formatInt } from '@/lib/format';
import { Card, EmptyState } from '@/shared/ui';
import {
  ChartTooltip,
  axisProps,
  chartColors,
  firstPayload,
  gridProps,
  tooltipCursor,
} from '@/shared/charts';
import type {
  ElasticityLinePoint,
  ScatterPoint,
  SurfacePriceScatter,
} from '../lib/explorerAnalytics';

/**
 * Nuage surface × prix et droite d'élasticité.
 *
 * La droite est dessinée par un second Scatter en mode `line` sans marqueur : Recharts
 * n'accepte pas de LineChart dans un ScatterChart, et cette forme évite un ComposedChart
 * dont les échelles seraient recalculées sur deux séries de tailles très différentes.
 */

interface TooltipProps {
  readonly active?: boolean;
  readonly payload?: unknown;
}

const TYPE_LABELS = { appartement: 'Appartement', maison: 'Maison' } as const;

function ScatterTooltip({ active, payload }: TooltipProps) {
  const point = firstPayload<ScatterPoint | ElasticityLinePoint>(payload);
  // La droite d'élasticité partage le même conteneur : ses deux extrémités n'ont pas de
  // mutation derrière elles, il n'y a donc rien à décrire.
  if (!active || point === undefined || !('communeName' in point)) return null;
  const color = point.propertyType === 'appartement' ? chartColors.accent : chartColors.info;
  return (
    <ChartTooltip
      title={point.communeName}
      rows={[
        { label: 'Type', value: TYPE_LABELS[point.propertyType], color },
        { label: 'Surface', value: `${formatInt(point.surface)} m²` },
        { label: 'Prix', value: formatEur(point.price) },
        { label: 'Prix au m²', value: formatEurPerSqm(point.pricePerSqm), muted: true },
      ]}
    />
  );
}

function Legend({ elasticity }: { readonly elasticity: number }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-muted">
      <li className="flex items-center gap-1.5">
        <span
          className="size-2 rounded-full"
          style={{ background: chartColors.accent, opacity: 0.5 }}
          aria-hidden
        />
        Appartement
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="size-2 rounded-full"
          style={{ background: chartColors.info, opacity: 0.5 }}
          aria-hidden
        />
        Maison
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded" style={{ background: chartColors.warn }} aria-hidden />
        Droite d&apos;élasticité
        {Number.isFinite(elasticity) && (
          <span className="tabular text-fg-subtle">
            ({elasticity.toLocaleString('fr-FR', { maximumFractionDigits: 2 })})
          </span>
        )}
      </li>
    </ul>
  );
}

export function SurfacePriceCard({
  scatter,
  height = 320,
  className = '',
}: {
  readonly scatter: SurfacePriceScatter;
  readonly height?: number;
  readonly className?: string;
}) {
  const { points, fit, line, sampled } = scatter;
  const apartments = points.filter((p) => p.propertyType === 'appartement');
  const houses = points.filter((p) => p.propertyType === 'maison');
  const hasData = points.length > 0;

  return (
    <Card
      title="Prix en fonction de la surface"
      className={className}
      subtitle={
        hasData
          ? `${formatInt(points.length)} points affichés sur ${formatInt(sampled)} mutations`
          : 'Aucune mutation dans la sélection'
      }
    >
      {hasData ? (
        <>
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                {...axisProps}
                type="number"
                dataKey="surface"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value: number) => formatInt(value)}
              />
              <YAxis
                {...axisProps}
                type="number"
                dataKey="price"
                width={52}
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value: number) => formatCompact(value)}
              />
              <ZAxis range={[18, 18]} />
              <Tooltip cursor={tooltipCursor} content={<ScatterTooltip />} />
              <Scatter
                name="Appartement"
                data={apartments}
                fill={chartColors.accent}
                fillOpacity={0.5}
                isAnimationActive={false}
              />
              <Scatter
                name="Maison"
                data={houses}
                fill={chartColors.info}
                fillOpacity={0.5}
                isAnimationActive={false}
              />
              {line.length === 2 && (
                <Scatter
                  name="Élasticité"
                  data={[...line]}
                  line={{ stroke: chartColors.warn, strokeWidth: 2 }}
                  fill="none"
                  isAnimationActive={false}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
          <Legend elasticity={fit.slope} />
        </>
      ) : (
        <EmptyState message="Élargissez les filtres pour afficher un nuage de points." />
      )}
    </Card>
  );
}
