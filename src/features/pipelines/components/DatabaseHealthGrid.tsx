import type { ReactNode } from 'react';
import { formatBytes, formatDateTime, formatInt } from '@/lib/format';
import { cn } from '@/shared/ui';
import type { DatabaseHealth } from '@/shared/types/dvf';
import { HEALTHY_CACHE_HIT_RATIO, minutesSince } from '../lib/pipelineMetrics';

function Indicator({
  label,
  value,
  detail,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="tabular text-lg font-semibold text-fg">{value}</p>
      {children}
      {detail && <p className="text-xs text-fg-subtle">{detail}</p>}
    </div>
  );
}

/** Barre de progression sobre : une piste, un remplissage, aucune animation. */
function Bar({ ratio, tone }: { readonly ratio: number; readonly tone: 'accent' | 'info' }) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-surface"
      role="img"
      aria-label={`Remplissage ${formatInt(clamped * 100)} %`}
    >
      <div
        className={cn('h-full rounded-full', tone === 'accent' ? 'bg-accent' : 'bg-info')}
        style={{ width: `${String(clamped * 100)}%` }}
      />
    </div>
  );
}

export function DatabaseHealthGrid({ health }: { readonly health: DatabaseHealth }) {
  const connectionRatio =
    health.maxConnections > 0 ? health.activeConnections / health.maxConnections : 0;
  const cacheHealthy = health.cacheHitRatio > HEALTHY_CACHE_HIT_RATIO;
  const refreshAgeMin = minutesSince(health.lastRefreshAt, health.checkedAt);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Indicator
        label="Connexions actives"
        value={`${formatInt(health.activeConnections)} / ${formatInt(health.maxConnections)}`}
        detail={`${formatInt(connectionRatio * 100)} % du pool`}
      >
        <Bar ratio={connectionRatio} tone="info" />
      </Indicator>

      <Indicator
        label="Cache hit ratio"
        value={health.cacheHitRatio.toLocaleString('fr-FR', {
          style: 'percent',
          minimumFractionDigits: 2,
        })}
        detail={cacheHealthy ? 'Au-dessus du seuil de 95 %' : 'Sous le seuil de 95 %'}
      >
        <Bar ratio={health.cacheHitRatio} tone={cacheHealthy ? 'accent' : 'info'} />
      </Indicator>

      <Indicator
        label="Taille de la base"
        value={formatBytes(health.dbSizeBytes)}
        detail="Détail 12 mois, agrégats 36 mois et index"
      />

      <Indicator
        label="Brut (tampon) → Nettoyé (12 mois)"
        value={`${formatInt(health.rawRows)} → ${formatInt(health.cleanRows)}`}
        detail="Le brut est purgé dès qu'un département est agrégé ; le détail couvre 12 mois glissants"
      />

      <Indicator
        label="Rafraîchissement des vues"
        value={formatDateTime(health.lastRefreshAt)}
        detail={
          Number.isNaN(refreshAgeMin)
            ? 'Date indisponible'
            : `il y a ${formatInt(refreshAgeMin)} min`
        }
      />

      <Indicator
        label="Lag de réplication"
        value={`${formatInt(health.replicationLagMs)} ms`}
        detail={health.replicationLagMs < 1000 ? 'Réplica dans la seconde' : 'Réplica en retard'}
      />
    </div>
  );
}
