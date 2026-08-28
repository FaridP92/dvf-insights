import { useMemo, useState } from 'react';
import { formatEur, formatEurPerSqm, formatInt } from '@/lib/format';
import { fetchCommunes, fetchCommuneStats, fetchTransactions } from '@/shared/api/repository';
import type { DepartmentOption } from '@/shared/api/useDepartments';
import { useQuery } from '@/shared/api/useQuery';
import type { PropertyType, Transaction } from '@/shared/types/dvf';
import {
  Badge,
  Card,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  SearchableSelect,
  Segmented,
  type BadgeTone,
} from '@/shared/ui';
import { type Confidence, estimate } from '../lib/predictionEngine';
import { formatElasticity, formatShortDate } from '../lib/display';

const SURFACE_MIN = 15;
const SURFACE_MAX = 250;
const DEFAULT_SURFACE = 60;

/** Département proposé au premier chargement. */
const DEFAULT_DEPARTMENT = '75';

const TYPE_OPTIONS: ReadonlyArray<{ readonly value: PropertyType; readonly label: string }> = [
  { value: 'appartement', label: 'Appartement' },
  { value: 'maison', label: 'Maison' },
];

/** Le libellé "5+" couvre les grands logements : au-delà, la prime de pièces sature. */
const ROOM_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5+' },
];

const CONFIDENCE_TONE: Readonly<Record<Confidence, BadgeTone>> = {
  haute: 'accent',
  moyenne: 'warn',
  faible: 'danger',
};

const clampSurface = (value: number): number =>
  Math.min(SURFACE_MAX, Math.max(SURFACE_MIN, Math.round(value)));

function ComparableRow({ row }: { readonly row: Transaction }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-t border-border py-1.5 text-xs">
      <span className="text-fg-subtle tabular">{formatShortDate(row.date)}</span>
      <span className="text-fg-muted tabular">
        {formatInt(row.surface)} m² · {formatInt(row.rooms)} p.
      </span>
      <span className="ml-auto text-fg tabular">{formatEur(row.price)}</span>
      <span className="w-24 text-right text-fg-subtle tabular">
        {formatEurPerSqm(row.pricePerSqm)}
      </span>
    </li>
  );
}

/**
 * Simulateur d'estimation : le résultat se recalcule à chaque frappe, sans bouton.
 * Un formulaire qui attend une validation cache le lien entre l'entrée et le modèle ;
 * ici le prix bouge sous le curseur, ce qui rend l'élasticité de surface lisible.
 *
 * Le département choisit le référentiel communal et les agrégats ; la commune choisie
 * détermine à elle seule les mutations chargées, soit quelques centaines de lignes au
 * lieu des 2,3 millions du détail national.
 */
export function EstimatorCard({
  departmentOptions,
  className,
}: {
  readonly departmentOptions: readonly DepartmentOption[];
  readonly className?: string;
}) {
  const [department, setDepartment] = useState(DEFAULT_DEPARTMENT);
  const [inseeCode, setInseeCode] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('appartement');
  const [surface, setSurface] = useState(DEFAULT_SURFACE);
  const [rooms, setRooms] = useState('3');

  const communes = useQuery((signal) => fetchCommunes(department, signal), [department]);
  const communeStats = useQuery(
    (signal) => fetchCommuneStats({ departmentCode: department }, signal),
    [department],
  );

  const communeOptions = useMemo(
    () => (communes.data ?? []).map((row) => ({ value: row.inseeCode, label: row.name })),
    [communes.data],
  );

  // Le département peut invalider la commune choisie : on retombe sur la première.
  const activeCommune = communeOptions.some((option) => option.value === inseeCode)
    ? inseeCode
    : (communeOptions[0]?.value ?? '');

  const sales = useQuery(
    (signal) =>
      fetchTransactions({ departmentCode: department, inseeCode: activeCommune }, signal),
    [department, activeCommune],
  );

  const result = useMemo(
    () =>
      activeCommune === ''
        ? null
        : estimate(
            { inseeCode: activeCommune, propertyType, surface, rooms: Number(rooms) },
            communeStats.data ?? [],
            sales.data ?? [],
          ),
    [activeCommune, propertyType, surface, rooms, communeStats.data, sales.data],
  );

  // Le référentiel commande le formulaire ; les mutations ne commandent que le résultat.
  // Sans cette séparation, changer de commune ferait clignoter les contrôles eux-mêmes.
  const loading = communes.status === 'loading' || communeStats.status === 'loading';
  const failed = [communes, communeStats].find((query) => query.status === 'error') ?? null;

  return (
    <Card
      title="Simulateur d'estimation"
      subtitle="Prix de marché estimé pour un bien, recalculé en direct"
      className={className ?? ''}
    >
      {failed !== null && failed.status === 'error' ? (
        <ErrorState error={failed.error} onRetry={failed.refetch} />
      ) : loading ? (
        <ChartSkeleton height={420} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <SearchableSelect
                value={department}
                onChange={setDepartment}
                options={departmentOptions}
                ariaLabel="Département du bien"
                className="w-full"
              />
              <SearchableSelect
                value={activeCommune}
                onChange={setInseeCode}
                options={communeOptions}
                ariaLabel="Commune du bien"
                className="w-full"
              />
            </div>

            <Segmented
              value={propertyType}
              onChange={setPropertyType}
              options={TYPE_OPTIONS}
              ariaLabel="Type de bien"
            />

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="estimator-surface" className="text-xs font-medium text-fg-muted">
                  Surface
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="estimator-surface-value"
                    type="number"
                    min={SURFACE_MIN}
                    max={SURFACE_MAX}
                    value={surface}
                    aria-label="Surface en m², saisie numérique"
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next)) setSurface(clampSurface(next));
                    }}
                    className="focus-ring w-20 rounded-lg border border-border bg-surface px-2 py-1 text-xs tabular text-fg hover:border-border-strong"
                  />
                  <span className="text-xs text-fg-subtle">m²</span>
                </div>
              </div>
              <input
                id="estimator-surface"
                type="range"
                min={SURFACE_MIN}
                max={SURFACE_MAX}
                step={1}
                value={surface}
                aria-label="Surface en m²"
                onChange={(event) => setSurface(clampSurface(Number(event.target.value)))}
                className="focus-ring h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-accent"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-fg-muted">Pièces</span>
              <Segmented
                value={rooms}
                onChange={setRooms}
                options={ROOM_OPTIONS}
                ariaLabel="Nombre de pièces"
              />
            </div>
          </div>

          {sales.status === 'error' ? (
            <ErrorState error={sales.error} onRetry={sales.refetch} />
          ) : sales.status === 'loading' ? (
            <ChartSkeleton height={220} />
          ) : result === null ? (
            <EmptyState message="Aucune référence locale pour ce couple commune et type de bien." />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-border bg-surface-2/60 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                  Estimation
                </p>
                <p className="mt-1 text-3xl font-semibold tabular text-fg">
                  {formatEur(result.estimate.value)}
                </p>
                <p className="mt-1 text-xs text-fg-muted tabular">
                  {formatEur(result.estimate.low)} - {formatEur(result.estimate.high)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-fg-subtle tabular">
                    {formatEurPerSqm(result.pricePerSqm)} implicite
                  </span>
                  <Badge tone={CONFIDENCE_TONE[result.confidence]}>
                    Confiance {result.confidence}
                  </Badge>
                  <span className="text-xs text-fg-subtle tabular">
                    {formatInt(result.sampleSize)} ventes locales
                  </span>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
                  Comparables les plus proches
                </p>
                {result.comparables.length === 0 ? (
                  <EmptyState message="Aucune mutation comparable dans cette commune." />
                ) : (
                  <ul>
                    {result.comparables.map((row) => (
                      <ComparableRow key={row.id} row={row} />
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-fg-subtle">
                Modèle hédonique : médiane locale × ajustement d&apos;élasticité (e ={' '}
                {formatElasticity(result.elasticity)}) × prime de pièces. Intervalle ≈ 80 %.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
