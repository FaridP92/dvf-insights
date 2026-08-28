import { Banknote, Coins, Receipt } from 'lucide-react';
import { formatCompact, formatEurPerSqm, formatInt } from '@/lib/format';
import { Sparkline } from '@/shared/charts';
import { KpiCard } from '@/shared/ui';
import type { Headline, MonthlyPoint } from '../lib/overviewMetrics';
import { TensionKpiCard } from './TensionKpiCard';

/** Profondeur des sparklines : deux ans, assez pour voir le cycle sans le lisser. */
const SPARK_MONTHS = 24;

/**
 * Les quatre chiffres de tête. Ils répondent dans l'ordre aux quatre questions d'un
 * décideur : à quel prix, à quel rythme, pour quel montant, et sous quelle pression.
 */
export function HeadlineKpis({
  headline,
  series,
}: {
  readonly headline: Headline;
  readonly series: readonly MonthlyPoint[];
}) {
  const recent = series.slice(-SPARK_MONTHS);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Prix médian au m²"
        value={formatEurPerSqm(headline.medianPricePerSqm)}
        change={headline.priceChange}
        hint="12 mois glissants"
        icon={Banknote}
        sparkline={
          <Sparkline id="prix" data={recent.map((point) => point.medianPricePerSqm)} />
        }
      />
      <KpiCard
        label="Transactions 12 mois"
        value={formatInt(headline.transactions)}
        change={headline.volumeChange}
        hint="ventes enregistrées"
        icon={Receipt}
        sparkline={<Sparkline id="volume" data={recent.map((point) => point.transactions)} />}
      />
      <KpiCard
        label="Valeur échangée 12 mois"
        value={`${formatCompact(headline.totalValue)} €`}
        change={headline.valueChange}
        hint="montant des mutations"
        icon={Coins}
      />
      <TensionKpiCard value={headline.tension} label={headline.tensionLabel} />
    </div>
  );
}
