import { useQuery } from '@/shared/api/useQuery';
import { fetchMonthlyStats } from '@/shared/api/repository';
import { useDepartments } from '@/shared/api/useDepartments';
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
 * de la norme (anomalies).
 *
 * Seuls les agrégats mensuels sont partagés : ils tiennent en 7 000 lignes pour la France
 * entière. Le détail des mutations, lui, est territorialisé, donc chaque carte qui en a
 * besoin charge le sien pour le département qu'elle affiche.
 */
export default function PredictionsPage() {
  const monthly = useQuery(fetchMonthlyStats, []);
  const { departments, options } = useDepartments();

  return (
    <>
      <PageHeader
        title="Prédictions IA & Tendances"
        description="Estimation hédonique, projection à douze mois par lissage de Holt, phases de marché et détection d'anomalies par z-score robuste."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <EstimatorCard departmentOptions={options} />
        <ForecastCard monthly={monthly} departmentOptions={options} className="xl:col-span-2" />
      </div>

      <div className="mt-4 grid gap-4">
        <MarketPhasesCard monthly={monthly} departments={departments} />
        <AnomaliesCard departmentOptions={options} />
      </div>
    </>
  );
}
