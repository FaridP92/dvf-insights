import type { CommuneStat, Transaction } from '@/shared/types/dvf';
import { REFERENCE_SURFACE } from './departments';
import { generateCommuneStats } from './communeStats';
import { REFERENCE_DATE } from './monthlyStats';
import { clamp, createRng, round } from './seed';

const SEED = 480_913;

/** Fenêtre couverte par l'échantillon de mutations : les douze derniers mois. */
const WINDOW_DAYS = 365;

/** Bornes de surface bâtie, par type de bien. */
const SURFACE_BOUNDS = {
  appartement: { min: 18, max: 140, logSd: 0.42, sqmPerRoom: 22 },
  maison: { min: 60, max: 250, logSd: 0.32, sqmPerRoom: 28 },
} as const;

/**
 * Élasticité prix/surface : le prix au m² décroît quand la surface augmente.
 * Un exposant de 0,88 signifie qu'un doublement de surface n'augmente le prix
 * que d'environ 84 %, ce qui correspond à la décote observée sur les grandes surfaces.
 */
const SURFACE_ELASTICITY = 0.88;

/** Part de mutations volontairement aberrantes, matière première de la détection d'anomalies. */
const ANOMALY_RATE = 0.02;

/** Fenêtre de prix au m² imposée par le nettoyage SQL : hors de là, la donnée est fausse. */
const MIN_PRICE_PER_SQM = 200;
const MAX_PRICE_PER_SQM = 29_000;

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Échantillon de mutations nettoyées, cohérent avec les agrégats communaux.
 *
 * Chaque mutation est tirée dans une commune au prorata de son volume, puis son prix est
 * reconstruit à partir du prix médian communal, de l'élasticité de surface et d'un bruit
 * log-normal. Environ 2 % des lignes sont volontairement sous- ou surévaluées : sans elles,
 * la page de détection d'anomalies n'aurait rien à montrer.
 */
export function generateTransactions(count = 2500): readonly Transaction[] {
  const rng = createRng(SEED);
  const communes = generateCommuneStats();
  const fallback = communes[0];
  if (fallback === undefined) return [];

  // Tirage pondéré par les volumes : les grandes communes concentrent les mutations.
  const cumulative: number[] = [];
  let total = 0;
  for (const commune of communes) {
    total += commune.transactions;
    cumulative.push(total);
  }

  const pickCommune = (): CommuneStat => {
    const target = rng.next() * total;
    for (let i = 0; i < cumulative.length; i += 1) {
      if (target <= (cumulative[i] ?? 0)) return communes[i] ?? fallback;
    }
    return communes[communes.length - 1] ?? fallback;
  };

  const rows: Transaction[] = [];

  for (let i = 0; i < count; i += 1) {
    const commune = pickCommune();
    const bounds = SURFACE_BOUNDS[commune.propertyType];
    const reference = REFERENCE_SURFACE[commune.propertyType];

    const surface = round(
      clamp(Math.exp(rng.normal(Math.log(reference), bounds.logSd)), bounds.min, bounds.max),
      1,
    );
    const rooms = clamp(
      Math.round(surface / bounds.sqmPerRoom + rng.range(-0.4, 0.4)),
      commune.propertyType === 'appartement' ? 1 : 2,
      commune.propertyType === 'appartement' ? 8 : 9,
    );
    const landSurface = commune.propertyType === 'maison' ? rng.int(150, 1500) : 0;

    const elasticityFactor = (surface / reference) ** (SURFACE_ELASTICITY - 1);
    const noise = Math.exp(rng.normal(0, 0.15));
    const isAnomaly = rng.next() < ANOMALY_RATE;
    const anomalyFactor = isAnomaly ? (rng.next() < 0.5 ? 0.45 : 2.2) : 1;

    const rawPricePerSqm = commune.medianPricePerSqm * elasticityFactor * noise * anomalyFactor;
    const cappedPricePerSqm = clamp(rawPricePerSqm, MIN_PRICE_PER_SQM, MAX_PRICE_PER_SQM);

    // Le prix est arrondi à la centaine d'euros, comme dans les actes ; le prix au m²
    // est ensuite recalculé à partir du prix retenu pour rester exactement cohérent.
    const price = Math.max(1000, Math.round((cappedPricePerSqm * surface) / 100) * 100);
    const daysAgo = rng.int(0, WINDOW_DAYS - 1);
    const date = new Date(REFERENCE_DATE.getTime() - daysAgo * 86_400_000);
    const year = date.getUTCFullYear();

    rows.push({
      id: `M${year}-${String(i + 1).padStart(6, '0')}`,
      date: isoDate(date),
      inseeCode: commune.inseeCode,
      communeName: commune.communeName,
      departmentCode: commune.departmentCode,
      propertyType: commune.propertyType,
      price,
      surface,
      rooms,
      landSurface,
      pricePerSqm: round(price / surface, 2),
    });
  }

  return rows.toSorted((a, b) => b.date.localeCompare(a.date));
}
