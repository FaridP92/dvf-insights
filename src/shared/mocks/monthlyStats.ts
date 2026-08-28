import type { MonthlyStat } from '@/shared/types/dvf';
import { DEPARTMENTS, PROPERTY_TYPES, REFERENCE_SURFACE } from './departments';
import { clamp, createRng, round } from './seed';

/** Dernier mois couvert par le jeu de démonstration. Tout le reste s'y ancre. */
const END_YEAR = 2026;
const END_MONTH = 7;
export const MONTHS_COUNT = 36;
export const REFERENCE_MONTH = `${END_YEAR}-${String(END_MONTH).padStart(2, '0')}`;

/**
 * Date de référence des mocks : fin du dernier mois couvert.
 * Fixée en dur pour que les jeux restent identiques d'une exécution à l'autre,
 * y compris en test et en captures d'écran.
 */
export const REFERENCE_DATE = new Date(Date.UTC(END_YEAR, END_MONTH - 1, 31, 12, 0, 0));

const SEED = 20_260_731;

/** Liste des 36 mois ISO "YYYY-MM", du plus ancien au plus récent. */
export function listMonths(): readonly string[] {
  const months: string[] = [];
  const lastAbsolute = END_YEAR * 12 + (END_MONTH - 1);
  for (let i = MONTHS_COUNT - 1; i >= 0; i -= 1) {
    const absolute = lastAbsolute - i;
    const year = Math.floor(absolute / 12);
    const month = (absolute % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Cycle de volume du marché français réel : effondrement des transactions courant 2023
 * (remontée des taux, resserrement du crédit), creux en 2024, reprise progressive à
 * partir de 2025. Interpolation linéaire entre des points d'ancrage annuels fractionnaires.
 */
const CYCLE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [2023, 1],
  [2023.6, 0.84],
  [2024.3, 0.68],
  [2025, 0.76],
  [2025.7, 0.92],
  [2026.6, 1.02],
];

function marketCycle(year: number, month: number): number {
  const x = year + (month - 1) / 12;
  const first = CYCLE_ANCHORS[0];
  const last = CYCLE_ANCHORS[CYCLE_ANCHORS.length - 1];
  if (first === undefined || last === undefined) return 1;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < CYCLE_ANCHORS.length; i += 1) {
    const previous = CYCLE_ANCHORS[i - 1];
    const current = CYCLE_ANCHORS[i];
    if (previous === undefined || current === undefined) continue;
    if (x <= current[0]) {
      const t = (x - previous[0]) / (current[0] - previous[0]);
      return previous[1] + t * (current[1] - previous[1]);
    }
  }
  return last[1];
}

/**
 * Saisonnalité des volumes : creux en janvier et en août, pics en juin et en décembre.
 * L'amplitude est forte car elle reflète la date de signature chez le notaire,
 * pas l'activité du marché.
 */
const VOLUME_SEASONALITY: readonly number[] = [
  0.72, 0.85, 0.98, 1.05, 1.12, 1.28, 1.06, 0.7, 1.02, 1.1, 1.08, 1.24,
];

/** Saisonnalité des prix : léger pic au printemps et en été, amplitude de 2 %. */
const priceSeasonality = (month: number): number =>
  1 + 0.02 * Math.sin((2 * Math.PI * (month - 3)) / 12);

/**
 * Série mensuelle par département et type de bien, sur 36 mois.
 *
 * Prix = niveau de référence × tendance annuelle composée × saisonnalité × bruit gaussien.
 * Volumes = parc × taux de rotation × saisonnalité forte × cycle de marché.
 * Les quantiles P10 et P90 encadrent la médiane avec un écartement typique du marché
 * français (environ 0,62 et 1,55 fois la médiane), lui-même légèrement bruité.
 */
export function generateMonthlyStats(): readonly MonthlyStat[] {
  const rng = createRng(SEED);
  const months = listMonths();
  const rows: MonthlyStat[] = [];

  for (const department of DEPARTMENTS) {
    for (const propertyType of PROPERTY_TYPES) {
      const base = department.basePricePerSqm[propertyType];
      const typeShare =
        propertyType === 'appartement' ? department.apartmentShare : 1 - department.apartmentShare;
      // 2 % du parc change de main chaque année, réparti sur douze mois.
      const monthlyBaseVolume = (department.housingStock * 0.02 * typeShare) / 12;

      months.forEach((month, index) => {
        const [yearPart, monthPart] = month.split('-');
        const year = Number(yearPart ?? END_YEAR);
        const monthNumber = Number(monthPart ?? END_MONTH);

        // index = MONTHS_COUNT - 1 correspond au mois de référence : le prix y vaut la base.
        const elapsedYears = (index - (MONTHS_COUNT - 1)) / 12;
        const trendFactor = (1 + department.annualTrend) ** elapsedYears;
        const priceNoise = rng.normal(1, 0.015);
        const medianPricePerSqm = base * trendFactor * priceSeasonality(monthNumber) * priceNoise;

        const seasonal = VOLUME_SEASONALITY[monthNumber - 1] ?? 1;
        const transactions = Math.max(
          12,
          Math.round(
            monthlyBaseVolume * seasonal * marketCycle(year, monthNumber) * rng.normal(1, 0.06),
          ),
        );

        const medianSurface = clamp(
          rng.normal(REFERENCE_SURFACE[propertyType], propertyType === 'appartement' ? 1.6 : 2.8),
          REFERENCE_SURFACE[propertyType] - 6,
          REFERENCE_SURFACE[propertyType] + 6,
        );

        const p10 = medianPricePerSqm * clamp(rng.normal(0.62, 0.02), 0.5, 0.75);
        const p90 = medianPricePerSqm * clamp(rng.normal(1.55, 0.05), 1.3, 1.85);

        rows.push({
          month,
          departmentCode: department.code,
          propertyType,
          transactions,
          medianPricePerSqm: round(medianPricePerSqm),
          p10PricePerSqm: round(p10),
          p90PricePerSqm: round(p90),
          medianSurface: round(medianSurface, 1),
          totalValue: Math.round(transactions * medianPricePerSqm * medianSurface * 1.05),
        });
      });
    }
  }

  return rows;
}
