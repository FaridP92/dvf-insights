/**
 * Agrégats de la vue d'ensemble.
 *
 * Tout le calcul dérivé vit ici, en fonctions pures et testées : les composants se
 * contentent de mémoïser et de mettre en forme. Les prix agrégés sont pondérés par le
 * nombre de transactions, sans quoi un département de 200 ventes pèserait autant que
 * Paris et la médiane nationale serait un artefact.
 */
import { movingAverage } from '@/lib/stats';
import { relativeChange, tensionIndex, tensionLabel, type TensionLabel } from '@/lib/stats';
import type { CommuneStat, Department, MonthlyStat, PropertyType } from '@/shared/types/dvf';

/** Valeur sentinelle des filtres : aucune restriction. */
export const ALL_FILTER = 'all';

export type PropertyTypeFilter = PropertyType | typeof ALL_FILTER;

export interface OverviewFilters {
  /** Code de département, ou ALL_FILTER pour la France entière du jeu de données. */
  readonly department: string;
  readonly propertyType: PropertyTypeFilter;
}

/** Un mois agrégé, tous départements et types de biens retenus par les filtres confondus. */
export interface MonthlyPoint {
  readonly month: string;
  readonly transactions: number;
  readonly medianPricePerSqm: number;
  readonly p10PricePerSqm: number;
  readonly p90PricePerSqm: number;
  readonly totalValue: number;
}

interface MonthAccumulator {
  transactions: number;
  weightedMedian: number;
  weightedP10: number;
  weightedP90: number;
  totalValue: number;
}

const matchesFilters = (row: MonthlyStat, filters: OverviewFilters): boolean =>
  (filters.department === ALL_FILTER || row.departmentCode === filters.department) &&
  (filters.propertyType === ALL_FILTER || row.propertyType === filters.propertyType);

const ratio = (sum: number, weight: number): number => (weight > 0 ? sum / weight : Number.NaN);

/**
 * Agrège les lignes mensuelles retenues par les filtres, un point par mois, trié du plus
 * ancien au plus récent. Les volumes et la valeur échangée s'additionnent, les quantiles
 * se moyennent en pondérant par le nombre de transactions.
 */
export function aggregateMonthly(
  stats: readonly MonthlyStat[],
  filters: OverviewFilters,
): readonly MonthlyPoint[] {
  const byMonth = new Map<string, MonthAccumulator>();

  for (const row of stats) {
    if (!matchesFilters(row, filters)) continue;
    const accumulator = byMonth.get(row.month) ?? {
      transactions: 0,
      weightedMedian: 0,
      weightedP10: 0,
      weightedP90: 0,
      totalValue: 0,
    };
    const weight = row.transactions;
    accumulator.transactions += weight;
    accumulator.weightedMedian += row.medianPricePerSqm * weight;
    accumulator.weightedP10 += row.p10PricePerSqm * weight;
    accumulator.weightedP90 += row.p90PricePerSqm * weight;
    accumulator.totalValue += row.totalValue;
    byMonth.set(row.month, accumulator);
  }

  return [...byMonth.entries()]
    .map(
      ([month, accumulator]): MonthlyPoint => ({
        month,
        transactions: accumulator.transactions,
        medianPricePerSqm: ratio(accumulator.weightedMedian, accumulator.transactions),
        p10PricePerSqm: ratio(accumulator.weightedP10, accumulator.transactions),
        p90PricePerSqm: ratio(accumulator.weightedP90, accumulator.transactions),
        totalValue: accumulator.totalValue,
      }),
    )
    .toSorted((a, b) => a.month.localeCompare(b.month));
}

/** Chiffres de tête du tableau de bord, lus sur les 12 derniers mois glissants. */
export interface Headline {
  /** Dernier mois complet couvert par la série, au format ISO "YYYY-MM". */
  readonly lastMonth: string;
  readonly medianPricePerSqm: number;
  readonly priceChange: number;
  readonly transactions: number;
  readonly volumeChange: number;
  readonly totalValue: number;
  readonly valueChange: number;
  readonly tension: number;
  readonly tensionLabel: TensionLabel;
  /** Volume total de la série complète, pour le bandeau de provenance. */
  readonly analysedTransactions: number;
}

const ROLLING_MONTHS = 12;

/** Taux de rotation de référence du marché français : 2 % du parc par an. */
const BASE_TURNOVER_RATE = 0.02;

const sumTransactions = (points: readonly MonthlyPoint[]): number =>
  points.reduce((accumulator, point) => accumulator + point.transactions, 0);

const sumValue = (points: readonly MonthlyPoint[]): number =>
  points.reduce((accumulator, point) => accumulator + point.totalValue, 0);

/** Médiane de période : moyenne des médianes mensuelles pondérée par les volumes. */
const rollingMedian = (points: readonly MonthlyPoint[]): number => {
  let weight = 0;
  let weighted = 0;
  for (const point of points) {
    if (!Number.isFinite(point.medianPricePerSqm)) continue;
    weight += point.transactions;
    weighted += point.medianPricePerSqm * point.transactions;
  }
  return ratio(weighted, weight);
};

/** Neutralise un NaN de comparaison : sans période N-1, on suppose une variation nulle. */
const orZero = (value: number): number => (Number.isFinite(value) ? value : 0);

/**
 * Chiffres de tête : 12 mois glissants comparés aux 12 mois précédents. Renvoie null sur
 * une série vide, ce qui laisse l'appelant afficher un état vide plutôt que des NaN.
 */
export function computeHeadline(series: readonly MonthlyPoint[]): Headline | null {
  const last = series.at(-1);
  if (last === undefined) return null;

  const current = series.slice(-ROLLING_MONTHS);
  const previous = series.slice(-2 * ROLLING_MONTHS, -ROLLING_MONTHS);

  const medianPricePerSqm = rollingMedian(current);
  const priceChange = relativeChange(medianPricePerSqm, rollingMedian(previous));

  const transactions = sumTransactions(current);
  const volumeChange = relativeChange(transactions, sumTransactions(previous));

  const totalValue = sumValue(current);
  const valueChange = relativeChange(totalValue, sumValue(previous));

  const safeVolumeChange = orZero(volumeChange);
  const tension = tensionIndex({
    volumeChange: safeVolumeChange,
    priceChange: orZero(priceChange),
    // Le parc communal n'est pas dans la vue : la rotation suit le momentum de volume.
    turnoverRate: BASE_TURNOVER_RATE * (1 + safeVolumeChange),
  });

  return {
    lastMonth: last.month,
    medianPricePerSqm,
    priceChange,
    transactions,
    volumeChange,
    totalValue,
    valueChange,
    tension,
    tensionLabel: tensionLabel(tension),
    analysedTransactions: sumTransactions(series),
  };
}

/** Série mensuelle d'un département, entrée de la comparaison en base 100. */
export interface DepartmentSeries {
  readonly code: string;
  readonly points: readonly MonthlyPoint[];
}

/** Une ligne de graphique : le mois, puis un indice par code de département. */
export interface Base100Row {
  readonly month: string;
  readonly [departmentCode: string]: number | string;
}

/**
 * Ramène chaque département à un indice 100 sur son premier mois observé. C'est la seule
 * façon de comparer sur un même axe Paris à 9 800 €/m² et le Nord à 2 500 €/m² : on ne
 * compare plus des niveaux mais des trajectoires.
 */
export function toBase100(statsByDepartment: readonly DepartmentSeries[]): readonly Base100Row[] {
  const bases = new Map<string, number>();
  const pricesByCode = new Map<string, Map<string, number>>();
  const months = new Set<string>();

  for (const department of statsByDepartment) {
    for (const point of department.points) months.add(point.month);
    const first = department.points[0];
    if (first === undefined) continue;
    if (!Number.isFinite(first.medianPricePerSqm) || first.medianPricePerSqm === 0) continue;
    bases.set(department.code, first.medianPricePerSqm);
    pricesByCode.set(
      department.code,
      new Map(department.points.map((point) => [point.month, point.medianPricePerSqm])),
    );
  }

  return [...months].toSorted((a, b) => a.localeCompare(b)).map((month): Base100Row => {
    const row: Record<string, number | string> = { month };
    for (const [code, base] of bases) {
      const price = pricesByCode.get(code)?.get(month);
      if (price === undefined || !Number.isFinite(price)) continue;
      row[code] = Math.round((price / base) * 1000) / 10;
    }
    return row as Base100Row;
  });
}

/** Série indicée d'un territoire : une région, ou le département mis en avant. */
export interface IndexSeries extends DepartmentSeries {
  readonly name: string;
}

/**
 * Trajectoires régionales en base 100.
 *
 * À douze départements, une courbe par département se lisait encore. À quatre-vingt-dix-sept,
 * le graphique devient un plat de spaghettis : on agrège donc par région administrative,
 * en pondérant les prix médians par le nombre de transactions, ce qui donne treize à dix-huit
 * trajectoires comparables. Les départements absents du référentiel sont ignorés plutôt
 * que regroupés dans une région fourre-tout.
 */
/** Régions d'outre-mer : trop peu de ventes pour une trajectoire lisible, exclues de la comparaison. */
export const OVERSEAS_REGIONS: ReadonlySet<string> = new Set([
  'Guadeloupe',
  'Martinique',
  'Guyane',
  'La Réunion',
  'Mayotte',
]);

export function toRegionBase100(
  stats: readonly MonthlyStat[],
  departments: readonly Department[],
  propertyType: PropertyTypeFilter = ALL_FILTER,
  options: { readonly metropolitanOnly?: boolean } = {},
): readonly IndexSeries[] {
  const metropolitanOnly = options.metropolitanOnly ?? true;
  const regionByCode = new Map(
    departments
      .filter((d) => !metropolitanOnly || !OVERSEAS_REGIONS.has(d.region))
      .map((d) => [d.code, d.region]),
  );
  const byRegion = new Map<string, MonthlyStat[]>();

  for (const row of stats) {
    const region = regionByCode.get(row.departmentCode);
    if (region === undefined) continue;
    const bucket = byRegion.get(region);
    if (bucket) bucket.push(row);
    else byRegion.set(region, [row]);
  }

  return [...byRegion.entries()]
    .map(
      ([region, rows]): IndexSeries => ({
        code: region,
        name: region,
        points: aggregateMonthly(rows, { department: ALL_FILTER, propertyType }),
      }),
    )
    .filter((series) => series.points.length > 0)
    .toSorted((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * Lisse chaque indice par moyenne mobile centrée : la saisonnalité mensuelle disparaît,
 * la trajectoire reste. Les mois où une série manque sont laissés tels quels.
 */
export function smoothBase100(rows: readonly Base100Row[], window = 3): readonly Base100Row[] {
  if (window <= 1 || rows.length === 0) return rows;
  const codes = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) if (key !== 'month') codes.add(key);
  const smoothed: Record<string, readonly number[]> = {};
  for (const code of codes) {
    const values = rows.map((row) => (typeof row[code] === 'number' ? row[code] : Number.NaN));
    smoothed[code] = movingAverage(values, window);
  }
  return rows.map((row, index): Base100Row => {
    const out: Record<string, number | string> = { month: row.month };
    for (const code of codes) {
      const value = smoothed[code]?.[index];
      if (typeof row[code] === 'number' && value !== undefined && Number.isFinite(value)) {
        out[code] = Math.round(value * 10) / 10;
      }
    }
    return out as Base100Row;
  });
}

/**
 * Régions à mettre en avant dans la comparaison : les deux trajectoires les plus fortes et les
 * deux plus faibles au dernier mois. Le reste forme la trame grise.
 */
export function pickRegionHighlights(
  rows: readonly Base100Row[],
  codes: readonly string[],
  count = 2,
): readonly string[] {
  const last = rows.at(-1);
  if (last === undefined) return [];
  const ranked = codes
    .map((code) => ({ code, value: last[code] }))
    .filter((entry): entry is { code: string; value: number } => typeof entry.value === 'number')
    .toSorted((a, b) => b.value - a.value);
  if (ranked.length <= count * 2) return ranked.map((r) => r.code);
  return [...ranked.slice(0, count), ...ranked.slice(-count)].map((r) => r.code);
}

/** Communes qui montent et communes qui baissent, sur variation annuelle. */
export interface CommuneMovers {
  readonly risers: readonly CommuneStat[];
  readonly fallers: readonly CommuneStat[];
}

/** En deçà de ce volume annuel, la variation d'une commune n'est que du bruit. */
export const MIN_COMMUNE_TRANSACTIONS = 30;

/**
 * Les n plus fortes hausses et les n plus fortes baisses de prix sur un an. Les communes
 * de moins de 30 transactions sont écartées : sur de tels effectifs, la médiane bouge de
 * 20 % parce que deux biens atypiques ont changé de main.
 */
export function topMovers(communeStats: readonly CommuneStat[], n: number): CommuneMovers {
  if (n <= 0) return { risers: [], fallers: [] };

  const eligible = communeStats
    .filter(
      (commune) =>
        commune.transactions >= MIN_COMMUNE_TRANSACTIONS && Number.isFinite(commune.yoyChange),
    )
    .toSorted((a, b) => b.yoyChange - a.yoyChange);

  const cut = Math.max(n, eligible.length - n);
  return {
    risers: eligible.slice(0, n),
    fallers: eligible.slice(cut).toReversed(),
  };
}
