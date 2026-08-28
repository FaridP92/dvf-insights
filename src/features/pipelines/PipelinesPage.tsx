import { useCallback, useMemo } from 'react';
import { Activity, Database, Filter, Pause, Play, Rows3, Timer } from 'lucide-react';
import {
  fetchDatabaseHealth,
  fetchPipelineRuns,
  fetchWebhookEvents,
} from '@/shared/api/repository';
import { useQuery } from '@/shared/api/useQuery';
import { dataSource } from '@/shared/api/supabase';
import { formatCompact, formatDuration } from '@/lib/format';
import {
  Badge,
  Card,
  ChartSkeleton,
  ErrorState,
  KpiCard,
  KpiSkeleton,
  PageHeader,
} from '@/shared/ui';
import { ArchitectureFlow } from './components/ArchitectureFlow';
import { DatabaseHealthGrid } from './components/DatabaseHealthGrid';
import { RecentEventsList } from './components/RecentEventsList';
import { RunHistoryTable } from './components/RunHistoryTable';
import { WebhookTrafficChart } from './components/WebhookTrafficChart';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { architectureStatuses, runSummary, webhookSummary } from './lib/pipelineMetrics';

const REJECTION_HINT = 'filtres : doublons, VEFA, prix/m² hors [200, 30 000]';

const ratioLabel = (fraction: number): string =>
  Number.isNaN(fraction)
    ? '-'
    : fraction.toLocaleString('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

export default function PipelinesPage() {
  const runs = useQuery(fetchPipelineRuns, []);
  const events = useQuery(fetchWebhookEvents, []);
  const health = useQuery(fetchDatabaseHealth, []);

  const { refetch: refetchRuns } = runs;
  const { refetch: refetchEvents } = events;
  const { refetch: refetchHealth } = health;

  const refreshAll = useCallback(() => {
    refetchRuns();
    refetchEvents();
    refetchHealth();
  }, [refetchRuns, refetchEvents, refetchHealth]);

  const { secondsLeft, paused, toggle } = useAutoRefresh(refreshAll);

  const runStats = useMemo(
    () => (runs.data === undefined ? undefined : runSummary(runs.data)),
    [runs.data],
  );
  const webhookStats = useMemo(
    () => (events.data === undefined ? undefined : webhookSummary(events.data)),
    [events.data],
  );
  const stages = useMemo(
    () => architectureStatuses(runStats, webhookStats, health.data),
    [runStats, webhookStats, health.data],
  );

  return (
    <>
      <PageHeader
        title="Data Pipelines & Automatisation"
        description="Monitoring temps réel de la chaîne d'ingestion DVF"
        actions={
          <>
            <Badge tone={dataSource === 'supabase' ? 'accent' : 'neutral'}>
              <Database className="size-3" aria-hidden />
              {dataSource === 'supabase' ? 'Supabase' : 'Données simulées'}
            </Badge>
            <span className="tabular text-xs text-fg-subtle" aria-live="off">
              {paused ? 'Actualisation en pause' : `Actualisation dans ${String(secondsLeft)} s`}
            </span>
            <button
              type="button"
              onClick={toggle}
              aria-label={
                paused
                  ? "Reprendre l'actualisation automatique"
                  : "Mettre en pause l'actualisation automatique"
              }
              className="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {paused ? (
                <Play className="size-3.5" aria-hidden />
              ) : (
                <Pause className="size-3.5" aria-hidden />
              )}
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Card
          title="Architecture du flux"
          subtitle="Du CSV publié par la DGFiP jusqu'au graphique affiché, cinq étapes automatisées."
        >
          <ArchitectureFlow states={stages} />
        </Card>

        {runs.status === 'loading' && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </div>
        )}
        {runs.status === 'error' && <ErrorState error={runs.error} onRetry={runs.refetch} />}
        {runStats !== undefined && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Taux de succès 7 j"
              value={ratioLabel(runStats.successRate)}
              hint={`${String(runStats.succeeded)} succès, ${String(runStats.failed)} échecs`}
              icon={Activity}
            />
            <KpiCard
              label="Durée médiane d'un run"
              value={
                Number.isNaN(runStats.medianDurationMs)
                  ? '-'
                  : formatDuration(runStats.medianDurationMs)
              }
              hint={`${String(runStats.total)} exécutions sur 7 jours`}
              icon={Timer}
            />
            <KpiCard
              label="Lignes ingérées 7 j"
              value={formatCompact(runStats.rowsIngested)}
              hint="Mutations écrites dans dvf_mutations"
              icon={Rows3}
            />
            <KpiCard
              label="Taux de rejet qualité"
              value={ratioLabel(runStats.rejectionRate)}
              hint={REJECTION_HINT}
              icon={Filter}
            />
          </div>
        )}

        <Card
          title="Santé PostgreSQL"
          subtitle="Instantané de l'instance Supabase qui sert les vues matérialisées."
        >
          {health.status === 'loading' && <ChartSkeleton height={200} />}
          {health.status === 'error' && (
            <ErrorState error={health.error} onRetry={health.refetch} />
          )}
          {health.data !== undefined && <DatabaseHealthGrid health={health.data} />}
        </Card>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card
            className="xl:col-span-2"
            title="Trafic webhooks (24 h)"
            subtitle="Appels reçus par tranche de 30 minutes, erreurs empilées et latence P95."
            action={
              webhookStats && webhookStats.total > 0 ? (
                <Badge tone={webhookStats.errorRate < 0.05 ? 'accent' : 'warn'}>
                  {ratioLabel(webhookStats.errorRate)} d'erreurs
                </Badge>
              ) : undefined
            }
          >
            {events.status === 'loading' && <ChartSkeleton height={280} />}
            {events.status === 'error' && (
              <ErrorState error={events.error} onRetry={events.refetch} />
            )}
            {webhookStats !== undefined && <WebhookTrafficChart buckets={webhookStats.buckets} />}
          </Card>

          <Card title="Derniers événements" subtitle="Les 12 appels les plus récents.">
            {events.status === 'loading' && <ChartSkeleton height={280} />}
            {events.status === 'error' && (
              <ErrorState error={events.error} onRetry={events.refetch} />
            )}
            {events.data !== undefined && <RecentEventsList events={events.data} />}
          </Card>
        </div>

        <Card
          title="Historique des exécutions"
          subtitle="Les 40 dernières exécutions n8n, avec leur volumétrie et leur message d'erreur."
        >
          {runs.status === 'loading' && <ChartSkeleton height={320} />}
          {runs.status === 'error' && <ErrorState error={runs.error} onRetry={runs.refetch} />}
          {runs.data !== undefined && <RunHistoryTable runs={runs.data} />}
        </Card>
      </div>
    </>
  );
}
