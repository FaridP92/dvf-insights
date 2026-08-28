import { formatBytes, formatInt } from '@/lib/format';
import { Badge, EmptyState } from '@/shared/ui';
import type { WebhookEvent } from '@/shared/types/dvf';
import { httpTone } from '../lib/pipelineMetrics';

const VISIBLE_COUNT = 12;

const hourLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function RecentEventsList({ events }: { readonly events: readonly WebhookEvent[] }) {
  if (events.length === 0) return <EmptyState message="Aucun événement webhook." />;

  const latest = events
    .toSorted((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, VISIBLE_COUNT);

  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {latest.map((event) => (
        <li key={event.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
          <Badge tone={httpTone(event.statusCode)} className="tabular shrink-0">
            {event.statusCode}
          </Badge>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{event.source}</span>
          <span className="tabular shrink-0 text-xs text-fg-muted">
            {formatInt(event.latencyMs)} ms
          </span>
          <span className="tabular hidden shrink-0 text-xs text-fg-subtle sm:inline">
            {formatBytes(event.payloadBytes)}
          </span>
          <time dateTime={event.receivedAt} className="tabular shrink-0 text-xs text-fg-subtle">
            {hourLabel(event.receivedAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
