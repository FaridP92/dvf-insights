import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatInt } from '@/lib/format';
import {
  axisProps,
  chartColors,
  ChartTooltip,
  firstPayload,
  gridProps,
  tooltipCursor,
} from '@/shared/charts';
import { EmptyState } from '@/shared/ui';
import type { WebhookBucket } from '../lib/pipelineMetrics';

const CHART_HEIGHT = 280;

/** Une étiquette sur six, soit une graduation toutes les trois heures. */
const TICK_EVERY = 6;

function TrafficTooltip({
  active,
  payload,
}: {
  readonly active?: boolean;
  readonly payload?: unknown;
  readonly label?: unknown;
}) {
  const bucket = firstPayload<WebhookBucket>(payload);
  if (active !== true || bucket === undefined) return null;

  const endLabel = new Date(bucket.startMs + 30 * 60_000).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <ChartTooltip
      title={`${bucket.label} - ${endLabel}`}
      rows={[
        { label: 'Événements', value: formatInt(bucket.count), color: chartColors.accent },
        { label: 'Erreurs', value: formatInt(bucket.errors), color: chartColors.danger },
        { label: 'Latence P50', value: bucket.p50 === null ? '-' : `${formatInt(bucket.p50)} ms` },
        {
          label: 'Latence P95',
          value: bucket.p95 === null ? '-' : `${formatInt(bucket.p95)} ms`,
          color: chartColors.info,
        },
      ]}
      note={bucket.count === 0 ? 'Aucun appel sur cette tranche' : 'Tranche de 30 minutes'}
    />
  );
}

export function WebhookTrafficChart({ buckets }: { readonly buckets: readonly WebhookBucket[] }) {
  if (buckets.length === 0) return <EmptyState message="Aucun webhook reçu sur 24 heures." />;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap items-center gap-4 text-xs text-fg-muted">
        <li className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-sm"
            style={{ background: chartColors.accent }}
            aria-hidden
          />
          Livraisons réussies
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-sm"
            style={{ background: chartColors.danger }}
            aria-hidden
          />
          Erreurs (statut ≥ 400)
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="h-0.5 w-4 rounded-full"
            style={{ background: chartColors.info }}
            aria-hidden
          />
          Latence P95 (axe de droite)
        </li>
      </ul>

      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={[...buckets]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis {...axisProps} dataKey="label" interval={TICK_EVERY - 1} minTickGap={12} />
          <YAxis {...axisProps} yAxisId="events" width={36} allowDecimals={false} />
          <YAxis
            {...axisProps}
            yAxisId="latency"
            orientation="right"
            width={48}
            tickFormatter={(value: number) => `${formatInt(value)} ms`}
          />
          <Tooltip cursor={tooltipCursor} content={<TrafficTooltip />} />
          <Bar
            yAxisId="events"
            dataKey="ok"
            stackId="events"
            fill={chartColors.accent}
            fillOpacity={0.75}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            yAxisId="events"
            dataKey="errors"
            stackId="events"
            fill={chartColors.danger}
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="latency"
            type="monotone"
            dataKey="p95"
            stroke={chartColors.info}
            strokeWidth={1.75}
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
