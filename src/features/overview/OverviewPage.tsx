import { useMemo, useState } from 'react';
import { formatInt } from '@/lib/format';
import { fetchCommuneStats, fetchMonthlyStats } from '@/shared/api/repository';
import { useQuery } from '@/shared/api/useQuery';
import { DEPARTMENTS } from '@/shared/mocks/departments';
import type { CommuneStat, MonthlyStat } from '@/shared/types/dvf';
import {
  Card,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  KpiSkeleton,
  PageHeader,
  Segmented,
  Select,
} from '@/shared/ui';
import { CommuneMovers } from './components/CommuneMovers';
import { DepartmentIndexChart, type DepartmentTrack } from './components/DepartmentIndexChart';
import { HeadlineKpis } from './components/HeadlineKpis';
import { MonthlyVolumeChart } from './components/MonthlyVolumeChart';
import { PriceDispersionChart } from './components/PriceDispersionChart';
import {
  ALL_FILTER,
  aggregateMonthly,
  computeHeadline,
  topMovers,
  type PropertyTypeFilter,
} from './lib/overviewMetrics';

/** Références stables : évitent de recalculer les mémos pendant le chargement. */
const NO_MONTHLY: readonly MonthlyStat[] = [];
const NO_COMMUNES: readonly CommuneStat[] = [];

/** Nombre de communes affichées de chaque côté du classement. */
const MOVERS_PER_SIDE = 5;

const DEPARTMENT_OPTIONS = [
  { value: ALL_FILTER, label: 'Tous les départements' },
  ...DEPARTMENTS.map((department) => ({
    value: department.code,
    label: `${department.code} · ${department.name}`,
  })),
];

const PROPERTY_TYPE_OPTIONS: ReadonlyArray<{ value: PropertyTypeFilter; label: string }> = [
  { value: ALL_FILTER, label: 'Tous' },
  { value: 'appartement', label: 'Appartement' },
  { value: 'maison', label: 'Maison' },
];

const DEPARTMENT_NAMES: ReadonlyMap<string, string> = new Map(
  DEPARTMENTS.map((department) => [department.code, department.name]),
);

export default function OverviewPage() {
  const [department, setDepartment] = useState<string>(ALL_FILTER);
  const [propertyType, setPropertyType] = useState<PropertyTypeFilter>(ALL_FILTER);

  const monthly = useQuery(fetchMonthlyStats, []);
  const communes = useQuery(fetchCommuneStats, []);
  const monthlyRows = monthly.data ?? NO_MONTHLY;
  const communeRows = communes.data ?? NO_COMMUNES;

  const series = useMemo(
    () => aggregateMonthly(monthlyRows, { department, propertyType }),
    [monthlyRows, department, propertyType],
  );
  const headline = useMemo(() => computeHeadline(series), [series]);

  const tracks = useMemo(
    (): readonly DepartmentTrack[] =>
      DEPARTMENTS.map((profile) => ({
        code: profile.code,
        name: profile.name,
        points: aggregateMonthly(monthlyRows, { department: profile.code, propertyType }),
      })),
    [monthlyRows, propertyType],
  );

  const movers = useMemo(
    () =>
      topMovers(
        communeRows.filter(
          (commune) =>
            (department === ALL_FILTER || commune.departmentCode === department) &&
            (propertyType === ALL_FILTER || commune.propertyType === propertyType),
        ),
        MOVERS_PER_SIDE,
      ),
    [communeRows, department, propertyType],
  );

  const scope =
    department === ALL_FILTER
      ? '12 départements de référence'
      : (DEPARTMENT_NAMES.get(department) ?? department);

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        description={`Marché immobilier ${scope} : niveau des prix, rythme des transactions et pression du marché sur 36 mois.`}
        actions={
          <>
            <Select
              value={department}
              onChange={setDepartment}
              options={DEPARTMENT_OPTIONS}
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
          subtitle="Chaque département vaut 100 à son premier mois : on compare des trajectoires, pas des niveaux. Cliquez une légende pour l'isoler."
        >
          {monthly.status === 'loading' && <ChartSkeleton height={300} />}
          {monthly.status === 'error' && (
            <ErrorState error={monthly.error} onRetry={monthly.refetch} />
          )}
          {monthly.status === 'success' && (
            <DepartmentIndexChart tracks={tracks} selected={department} onSelect={setDepartment} />
          )}
        </Card>

        <Card
          title="Communes en mouvement"
          subtitle="Variation du prix médian sur un an, communes de 30 transactions et plus. Le badge donne la tension locale."
        >
          {communes.status === 'loading' && <ChartSkeleton height={200} />}
          {communes.status === 'error' && (
            <ErrorState error={communes.error} onRetry={communes.refetch} />
          )}
          {communes.status === 'success' && (
            <CommuneMovers movers={movers} departmentNames={DEPARTMENT_NAMES} />
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
