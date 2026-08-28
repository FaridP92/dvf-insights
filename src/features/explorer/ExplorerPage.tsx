import { useDeferredValue, useMemo } from 'react';
import { Building2, Euro, Ruler, SlidersHorizontal } from 'lucide-react';
import { fetchCommuneStats, fetchTransactions } from '@/shared/api/repository';
import { useQuery } from '@/shared/api/useQuery';
import { formatEurPerSqm, formatInt } from '@/lib/format';
import { median } from '@/lib/stats';
import { ChartSkeleton, ErrorState, KpiCard, KpiSkeleton, PageHeader } from '@/shared/ui';
import type { Transaction } from '@/shared/types/dvf';
import { FilterPanel } from './components/FilterPanel';
import { CommuneRankingCard } from './components/CommuneRankingCard';
import { CorrelationCard } from './components/CorrelationCard';
import { MarketStructureCard } from './components/MarketStructureCard';
import { PriceDistributionCard } from './components/PriceDistributionCard';
import { SurfacePriceCard } from './components/SurfacePriceCard';
import { useExplorerFilters } from './hooks/useExplorerFilters';
import {
  applyFilters,
  communeRanking,
  correlations,
  priceDistribution,
  structureBySurfaceBand,
  surfacePriceScatter,
} from './lib/explorerAnalytics';

/**
 * Explorateur et analytics.
 *
 * Deux sélections cohabitent volontairement : la sélection immédiate, qui alimente le
 * compteur et les KPI (une passe sur 2 500 lignes, imperceptible), et une sélection différée
 * via useDeferredValue, qui alimente les graphiques lourds. Un clic sur un chip de
 * département met donc à jour le compteur tout de suite, et le nuage de 800 points juste
 * après, sans jamais figer la saisie.
 */

const decimal = (value: number, digits = 2): string =>
  Number.isFinite(value)
    ? value.toLocaleString('fr-FR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : 'n/d';

/** Date de référence de la sélection : la mutation la plus récente, pas l'horloge du poste. */
function latestDate(transactions: readonly Transaction[]): Date {
  let latest = '';
  for (const t of transactions) {
    if (t.date > latest) latest = t.date;
  }
  return latest === '' ? new Date() : new Date(`${latest}T12:00:00.000Z`);
}

export default function ExplorerPage() {
  const [filters, dispatch] = useExplorerFilters();
  const deferredFilters = useDeferredValue(filters);

  const transactionsQuery = useQuery(fetchTransactions, []);
  const communesQuery = useQuery(fetchCommuneStats, []);

  const all = useMemo(() => transactionsQuery.data ?? [], [transactionsQuery.data]);
  const now = useMemo(() => latestDate(all), [all]);

  // Sélection immédiate : compteur et KPI restent collés aux contrôles.
  const selection = useMemo(() => applyFilters(all, filters, now), [all, filters, now]);
  // Sélection différée : React garde l'ancien rendu des graphiques le temps de recalculer.
  const deferredSelection = useMemo(
    () => applyFilters(all, deferredFilters, now),
    [all, deferredFilters, now],
  );

  const distribution = useMemo(() => priceDistribution(deferredSelection), [deferredSelection]);
  const scatter = useMemo(() => surfacePriceScatter(deferredSelection), [deferredSelection]);
  const matrix = useMemo(() => correlations(deferredSelection), [deferredSelection]);
  const structure = useMemo(() => structureBySurfaceBand(deferredSelection), [deferredSelection]);
  const ranking = useMemo(() => communeRanking(deferredSelection), [deferredSelection]);

  const stale = deferredFilters !== filters;
  const { stats } = distribution;
  const medianSurface = useMemo(() => median(selection.map((t) => t.surface)), [selection]);

  const header = (
    <PageHeader
      title="Explorateur & Analytics"
      description="Filtrez l'échantillon de mutations et lisez la structure du marché : distribution des prix, élasticité de surface, corrélations et classement des communes."
    />
  );

  if (transactionsQuery.status === 'error') {
    return (
      <>
        {header}
        <ErrorState error={transactionsQuery.error} onRetry={transactionsQuery.refetch} />
      </>
    );
  }

  if (transactionsQuery.status === 'loading') {
    return (
      <>
        {header}
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="card p-5 xl:col-span-2">
            <ChartSkeleton height={260} />
          </div>
          <div className="card p-5">
            <ChartSkeleton height={260} />
          </div>
        </div>
      </>
    );
  }

  const communesTracked = communesQuery.data?.length ?? 0;

  return (
    <>
      {header}

      <FilterPanel
        filters={filters}
        dispatch={dispatch}
        matched={selection.length}
        total={all.length}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Transactions"
          value={formatInt(selection.length)}
          hint={`sur ${formatInt(all.length)} de l'échantillon`}
          icon={SlidersHorizontal}
        />
        <KpiCard
          label="Prix médian au m²"
          value={Number.isFinite(stats.median) ? formatEurPerSqm(stats.median) : 'n/d'}
          hint="médiane de la sélection"
          icon={Euro}
        />
        <KpiCard
          label="Dispersion P10-P90"
          value={
            Number.isFinite(stats.p10) && Number.isFinite(stats.p90)
              ? `${formatInt(Math.round(stats.p10))} à ${formatEurPerSqm(stats.p90)}`
              : 'n/d'
          }
          hint="8 mutations sur 10 dans cette fourchette"
          icon={Building2}
        />
        <KpiCard
          label="Surface médiane"
          value={
            Number.isFinite(medianSurface) ? `${formatInt(Math.round(medianSurface))} m²` : 'n/d'
          }
          hint="surface bâtie"
          icon={Ruler}
        />
      </div>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-fg-muted">
        <span className="font-medium text-fg">
          Élasticité <span className="tabular">{decimal(scatter.fit.slope)}</span>
          <span className="mx-1.5 text-fg-subtle" aria-hidden>
            ·
          </span>
          R² <span className="tabular">{decimal(scatter.fit.r2)}</span>
        </span>
        <span className="text-fg-subtle">
          pente de log(prix) sur log(surface) : sous 1, le prix croît moins vite que la surface,
          c&apos;est la décote des grandes surfaces.
        </span>
      </p>

      <div
        className="mt-6 grid gap-4 xl:grid-cols-3"
        aria-busy={stale}
        style={{ opacity: stale ? 0.6 : 1, transition: 'opacity 150ms' }}
      >
        <PriceDistributionCard distribution={distribution} className="xl:col-span-2" />
        <CorrelationCard cells={matrix} />
        <SurfacePriceCard scatter={scatter} className="xl:col-span-2" />
        <MarketStructureCard rows={structure} />
        <CommuneRankingCard
          rows={ranking}
          subtitle={
            communesTracked > 0
              ? `Quinze communes les plus actives, sur ${formatInt(communesTracked)} séries communales suivies`
              : 'Les quinze communes les plus actives de la sélection'
          }
          className="xl:col-span-3"
        />
      </div>
    </>
  );
}
