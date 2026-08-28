import { useDeferredValue, useMemo, useState } from 'react';
import { Building2, Euro, Ruler, SlidersHorizontal } from 'lucide-react';
import { fetchCommuneStats, fetchTransactions } from '@/shared/api/repository';
import { useDepartments } from '@/shared/api/useDepartments';
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
 * Le département n'est pas un filtre : c'est la requête. Le détail national compte 2,3 millions
 * de mutations, on ne les charge jamais toutes ; changer de département recharge un échantillon
 * borné, les autres critères restent appliqués côté client sur cet échantillon.
 *
 * Deux sélections cohabitent ensuite volontairement : la sélection immédiate, qui alimente le
 * compteur et les KPI (une passe sur 2 500 lignes, imperceptible), et une sélection différée
 * via useDeferredValue, qui alimente les graphiques lourds. Un changement de borne met donc à
 * jour le compteur tout de suite, et le nuage de 800 points juste après, sans figer la saisie.
 */

/** Département affiché au premier chargement. */
const DEFAULT_DEPARTMENT = '75';

const NO_TRANSACTIONS: readonly Transaction[] = [];

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
  const [department, setDepartment] = useState(DEFAULT_DEPARTMENT);
  const deferredFilters = useDeferredValue(filters);
  const { options, names } = useDepartments();

  const transactionsQuery = useQuery(
    (signal) => fetchTransactions({ departmentCode: department }, signal),
    [department],
  );
  const communesQuery = useQuery(
    (signal) => fetchCommuneStats({ departmentCode: department }, signal),
    [department],
  );

  const all = transactionsQuery.data ?? NO_TRANSACTIONS;
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
  const ranking = useMemo(
    () => communeRanking(deferredSelection, undefined, names),
    [deferredSelection, names],
  );

  const stale = deferredFilters !== filters;
  const { stats } = distribution;
  const medianSurface = useMemo(() => median(selection.map((t) => t.surface)), [selection]);
  const communesTracked = communesQuery.data?.length ?? 0;
  const departmentName = names.get(department) ?? department;

  return (
    <>
      <PageHeader
        title="Explorateur & Analytics"
        description={`Mutations du département ${departmentName} : distribution des prix, élasticité de surface, corrélations et classement des communes.`}
      />

      <FilterPanel
        filters={filters}
        dispatch={dispatch}
        department={department}
        onDepartmentChange={setDepartment}
        departmentOptions={options}
        matched={selection.length}
        total={all.length}
      />

      {transactionsQuery.status === 'error' ? (
        <ErrorState error={transactionsQuery.error} onRetry={transactionsQuery.refetch} />
      ) : transactionsQuery.status === 'loading' ? (
        <>
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
      ) : (
        <>
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
                Number.isFinite(medianSurface)
                  ? `${formatInt(Math.round(medianSurface))} m²`
                  : 'n/d'
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
              pente de log(prix) sur log(surface) : sous 1, le prix croît moins vite que la
              surface, c&apos;est la décote des grandes surfaces.
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
                  ? `Quinze communes les plus actives, sur ${formatInt(communesTracked)} séries communales suivies dans le département`
                  : 'Les quinze communes les plus actives de la sélection'
              }
              className="xl:col-span-3"
            />
          </div>
        </>
      )}
    </>
  );
}
