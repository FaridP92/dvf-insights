import { useMemo, useState } from 'react';
import { formatEur, formatEurPerSqm, formatInt } from '@/lib/format';
import { fetchTransactions } from '@/shared/api/repository';
import type { DepartmentOption } from '@/shared/api/useDepartments';
import { useQuery } from '@/shared/api/useQuery';
import type { Transaction } from '@/shared/types/dvf';
import {
  Card,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  SearchableSelect,
  Segmented,
  Trend,
} from '@/shared/ui';
import { type MarketAnomaly, marketAnomalies } from '../lib/predictionEngine';
import { formatScore, formatShortDate } from '../lib/display';

type AnomalyFilter = 'all' | 'under' | 'over';

/** Département inspecté au premier chargement. */
const DEFAULT_DEPARTMENT = '75';

const FILTER_OPTIONS: ReadonlyArray<{ readonly value: AnomalyFilter; readonly label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'under', label: 'Sous-évaluées' },
  { value: 'over', label: 'Sur-évaluées' },
];

const TYPE_LABEL: Readonly<Record<Transaction['propertyType'], string>> = {
  appartement: 'Appartement',
  maison: 'Maison',
};

const HEADERS: readonly string[] = [
  'Date',
  'Commune',
  'Type',
  'Surface',
  'Prix',
  'Prix/m²',
  'Médiane locale',
  'Écart',
  'z',
];

function AnomalyRow({ anomaly }: { readonly anomaly: MarketAnomaly }) {
  const { transaction } = anomaly;
  return (
    <tr className="border-t border-border hover:bg-surface-2/40">
      <td className="whitespace-nowrap px-3 py-2 text-fg-subtle tabular">
        {formatShortDate(transaction.date)}
      </td>
      <td className="max-w-40 truncate px-3 py-2 text-fg">{transaction.communeName}</td>
      <td className="whitespace-nowrap px-3 py-2 text-fg-muted">
        {TYPE_LABEL[transaction.propertyType]}
      </td>
      <td className="px-3 py-2 text-right text-fg-muted tabular">
        {formatInt(transaction.surface)} m²
      </td>
      <td className="px-3 py-2 text-right text-fg tabular">{formatEur(transaction.price)}</td>
      <td className="px-3 py-2 text-right text-fg tabular">
        {formatEurPerSqm(transaction.pricePerSqm)}
      </td>
      <td className="px-3 py-2 text-right text-fg-subtle tabular">
        {formatEurPerSqm(anomaly.groupMedian)}
      </td>
      <td className="px-3 py-2 text-right">
        <Trend
          value={anomaly.deviation}
          positiveIsGood={false}
          label={anomaly.direction === 'over' ? 'sur-évalué' : 'sous-évalué'}
        />
      </td>
      <td className="px-3 py-2 text-right text-fg-muted tabular">{formatScore(anomaly.score)}</td>
    </tr>
  );
}

/**
 * Anomalies de prix au m².
 *
 * Le z-score est calculé au sein de chaque couple commune × type : sans ce groupage,
 * la liste ne contiendrait que des ventes parisiennes, chères sans être anormales.
 * La détection porte sur le détail d'un seul département, jamais sur le national :
 * une anomalie n'a de sens que rapportée à son marché local.
 */
export function AnomaliesCard({
  departmentOptions,
  className,
}: {
  readonly departmentOptions: readonly DepartmentOption[];
  readonly className?: string;
}) {
  const [filter, setFilter] = useState<AnomalyFilter>('all');
  const [department, setDepartment] = useState(DEFAULT_DEPARTMENT);

  const transactions = useQuery(
    (signal) => fetchTransactions({ departmentCode: department }, signal),
    [department],
  );

  const anomalies = useMemo(() => marketAnomalies(transactions.data ?? []), [transactions.data]);
  const visible = useMemo(
    () => (filter === 'all' ? anomalies : anomalies.filter((row) => row.direction === filter)),
    [anomalies, filter],
  );

  return (
    <Card
      title="Anomalies de marché détectées"
      subtitle="z-score robuste (MAD) par commune et type, seuil |z| ≥ 3"
      className={className ?? ''}
      padded={false}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <SearchableSelect
            value={department}
            onChange={setDepartment}
            options={departmentOptions}
            ariaLabel="Département des anomalies"
          />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS}
            ariaLabel="Filtrer les anomalies"
          />
        </div>
      }
    >
      {transactions.status === 'error' ? (
        <div className="p-5">
          <ErrorState error={transactions.error} onRetry={transactions.refetch} />
        </div>
      ) : transactions.status === 'loading' ? (
        <div className="p-5">
          <ChartSkeleton height={320} />
        </div>
      ) : visible.length === 0 ? (
        <div className="p-5">
          <EmptyState message="Aucune anomalie au-delà du seuil pour ce filtre." />
        </div>
      ) : (
        <div className="max-h-[26rem] overflow-auto">
          <table className="w-full min-w-[52rem] border-collapse text-xs">
            <caption className="sr-only">
              Mutations dont le prix au m² s&apos;écarte fortement de la médiane de leur commune
            </caption>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr>
                {HEADERS.map((header, index) => (
                  <th
                    key={header}
                    scope="col"
                    className={`px-3 py-2 font-medium text-fg-subtle ${index < 3 ? 'text-left' : 'text-right'}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((anomaly) => (
                <AnomalyRow key={anomaly.transaction.id} anomaly={anomaly} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
