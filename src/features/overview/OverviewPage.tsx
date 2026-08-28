import { useMemo, useState } from 'react';
import { formatInt } from '@/lib/format';
import { fetchMonthlyStats, fetchTopMovers } from '@/shared/api/repository';
import { useDepartments } from '@/shared/api/useDepartments';
import { useQuery } from '@/shared/api/useQuery';
import type { CommuneStat, MonthlyStat } from '@/shared/types/dvf';
import {
  Card,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  KpiSkeleton,
  PageHeader,
  SearchableSelect,
  Segmented,
} from '@/shared/ui';
import { CommuneMovers } from './components/CommuneMovers';
import { HeadlineKpis } from './components/HeadlineKpis';
import { MonthlyVolumeChart } from './components/MonthlyVolumeChart';
import { PriceDispersionChart } from './components/PriceDispersionChart';
import { RegionIndexChart } from './components/RegionIndexChart';
import {
  ALL_FILTER,
  aggregateMonthly,
  computeHeadline,
  toRegionBase100,
  topMovers,
  type IndexSeries,
  type PropertyTypeFilter,
} from './lib/overviewMetrics';

/** Références stables : évitent de recalculer les mémos pendant le chargement. */
const NO_MONTHLY: readonly MonthlyStat[] = [];
const NO_COMMUNES: readonly CommuneStat[] = [];

/** Nombre de communes affichées de chaque côté du classement. */
const MOVERS_PER_SIDE = 5;

const PROPERTY_TYPE_OPTIONS: ReadonlyArray<{ value: PropertyTypeFilter; label: string }> = [
  { value: ALL_FILTER, label: 'Tous' },
  { value: 'appartement', label: 'Appartement' },
  { value: 'maison', label: 'Maison' },
];

export default function OverviewPage() {
  const [department, setDepartment] = useState<string>(ALL_FILTER);
  const [propertyType, setPropertyType] = useState<PropertyTypeFilter>(ALL_FILTER);
  const { departments, options, names } = useDepartments();

  const monthly = useQuery(fetchMonthlyStats, []);
  // Les communes en mouvement sont triées côté serveur : charger les 40 000 lignes de
  // commune_stats pour n'en afficher dix serait le seul appel réellement coûteux de la page.
  const movers = useQuery(
    (signal) =>
      fetchTopMovers(
        {
          limit: MOVERS_PER_SIDE,
          departmentCode: department === ALL_FILTER ? undefined : department,
          propertyType: propertyType === ALL_FILTER ? undefined : propertyType,
        },
        signal,
      ),
    [department, propertyType],
  );

  const monthlyRows = monthly.data ?? NO_MONTHLY;
  const moverRows = movers.data ?? NO_COMMUNES;

  const departmentOptions = useMemo(
    () => [{ value: ALL_FILTER, label: 'France entière' }, ...options],
    [options],
  );

  const series = useMemo(
    () => aggregateMonthly(monthlyRows, { department, propertyType }),
    [monthlyRows, department, propertyType],
  );
  const headline = useMemo(() => computeHeadline(series), [series]);

  const regions = useMemo(
    () => toRegionBase100(monthlyRows, departments, propertyType),
    [monthlyRows, departments, propertyType],
  );
  const highlight = useMemo(
    (): IndexSeries | null =>
      department === ALL_FILTER
        ? null
        : { code: department, name: names.get(department) ?? department, points: series },
    [department, names, series],
  );

  const ranked = useMemo(() => topMovers(moverRows, MOVERS_PER_SIDE), [moverRows]);

  const scope =
    department === ALL_FILTER ? 'France entière' : (names.get(department) ?? department);

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        description={`Marché immobilier ${scope} : niveau des prix, rythme des transactions et pression du marché sur 36 mois.`}
        actions={
          <>
            <SearchableSelect
              value={department}
              onChange={setDepartment}
              options={departmentOptions}
              ariaLabel="Filtrer par département"
            />
            <Segmented
              value={propertyType}
              onChange={setPropertyType}
              options={PROPERTY_TYPE_OPTIONS}
              ariaLabel="Filtrer par type de bien"
            />
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {monthly.status === 'loading' && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </div>
        )}
        {monthly.status === 'error' && <ErrorState error={monthly.error} onRetry={monthly.refetch} />}
        {monthly.status === 'success' &&
          (headline === null ? (
            <Card>
              <EmptyState message="Aucune donnée pour ce filtre." />
            </Card>
          ) : (
            <HeadlineKpis headline={headline} series={series} />
          ))}

        <div className="grid gap-4 xl:grid-cols-3">
          <Card
            className="xl:col-span-2"
            title="Prix médian et dispersion"
            subtitle="Bande grise = 80 % des transactions (P10 à P90). La courbe est la médiane au m²."
          >
            {monthly.status === 'loading' && <ChartSkeleton height={320} />}
            {monthly.status === 'error' && (
              <ErrorState error={monthly.error} onRetry={monthly.refetch} />
            )}
            {monthly.status === 'success' && <PriceDispersionChart series={series} />}
          </Card>

          <Card
            title="Volume mensuel"
            subtitle="Barres pleines = 12 derniers mois. Le volume décroche avant les prix."
          >
            {monthly.status === 'loading' && <ChartSkeleton height={320} />}
            {monthly.status === 'error' && (
              <ErrorState error={monthly.error} onRetry={monthly.refetch} />
            )}
            {monthly.status === 'success' && <MonthlyVolumeChart series={series} />}
          </Card>
        </div>

        <Card
          title="Évolution comparée (base 100)"
          subtitle="Régions métropolitaines à 100 sur le premier mois, lissées sur trois mois. En couleur : les deux régions les plus dynamiques et les deux plus faibles ; le département sélectionné se superpose en accent."
        >
          {monthly.status === 'loading' && <ChartSkeleton height={300} />}
          {monthly.status === 'error' && (
            <ErrorState error={monthly.error} onRetry={monthly.refetch} />
          )}
          {monthly.status === 'success' && (
            <RegionIndexChart regions={regions} highlight={highlight} />
          )}
        </Card>

        <Card
          title="Communes en mouvement"
          subtitle="Variation du prix médian sur un an, communes de 30 transactions et plus. Le badge donne la tension locale."
        >
          {movers.status === 'loading' && <ChartSkeleton height={200} />}
          {movers.status === 'error' && <ErrorState error={movers.error} onRetry={movers.refetch} />}
          {movers.status === 'success' && (
            <CommuneMovers movers={ranked} departmentNames={names} />
          )}
        </Card>

        <p className="pt-1 text-center text-xs text-fg-subtle">
          Source DVF · data.gouv.fr
          {headline !== null && (
            <>
              {' · '}
              {formatInt(headline.analysedTransactions)} transactions analysées · dernière période{' '}
              <span className="tabular">{headline.lastMonth}</span>
            </>
          )}
        </p>
      </div>
    </>
  );
}
