import { useQuery } from '@/shared/api/useQuery';
import { fetchCommuneStats, fetchMonthlyStats, fetchTransactions } from '@/shared/api/repository';
import { PageHeader } from '@/shared/ui';
import { AnomaliesCard } from './components/AnomaliesCard';
import { EstimatorCard } from './components/EstimatorCard';
import { ForecastCard } from './components/ForecastCard';
import { MarketPhasesCard } from './components/MarketPhasesCard';

/**
 * Prédictions IA & Tendances.
 *
 * Quatre lectures d'un même jeu : ce que vaut un bien (estimation), où va le marché
 * (prévision), où en est chaque département dans son cycle (phases), et ce qui sort
 * de la norme (anomalies). Les trois requêtes sont partagées par les cartes pour
 * n'interroger la source qu'une fois par page.
 */
export default function PredictionsPage() {
  const monthly = useQuery(fetchMonthlyStats, []);
  const communes = useQuery(fetchCommuneStats, []);
  const transactions = useQuery(fetchTransactions, []);

  return (
    <>
      <PageHeader
        title="Prédictions IA & Tendances"
        description="Estimation hédonique, projection à douze mois par lissage de Holt, phases de marché et détection d'anomalies par z-score robuste."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <EstimatorCard communes={communes} transactions={transactions} />
        <ForecastCard monthly={monthly} className="xl:col-span-2" />
      </div>

      <div className="mt-4 grid gap-4">
        <MarketPhasesCard monthly={monthly} />
        <AnomaliesCard transactions={transactions} />
      </div>
    </>
  );
}
