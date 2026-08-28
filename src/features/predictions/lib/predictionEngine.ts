import {
  type AnomalyDirection,
  type Estimate,
  detectAnomalies,
  estimatePrice,
  holtForecast,
  median,
  movingAverage,
  priceSurfaceElasticity,
  quantile,
  relativeChange,
} from '@/lib/stats';
import { findDepartment } from '@/shared/mocks/departments';
import type { CommuneStat, MonthlyStat, PropertyType, Transaction } from '@/shared/types/dvf';

/**
 * Moteur de prédiction de la page "Prédictions IA & Tendances".
 *
 * Tout le calcul dérivé vit ici, en fonctions pures : les composants ne font que
 * mémoïser un appel et mettre en forme le résultat. C'est ce qui rend la partie
 * modélisation testable sans monter un rendu React.
 */

/** Valeur sentinelle des filtres "Tous" (département ou type de bien). */
export const ALL = 'all';

export type TypeFilter = PropertyType | typeof ALL;

export interface ForecastFilter {
  /** Code département, ou 'all' pour agréger la France couverte par le jeu. */
  readonly department: string;
  readonly propertyType: TypeFilter;
  /** Lisse la série affichée par moyenne mobile 3 mois. Le modèle reste calé sur le brut. */
  readonly smooth?: boolean;
}

export interface ForecastSeriesPoint {
  readonly month: string;
  readonly actual?: number;
  readonly fitted?: number;
  readonly forecast?: number;
  readonly low?: number;
  readonly high?: number;
  readonly kind: 'history' | 'forecast';
}

export interface ForecastSummary {
  /** Variation projetée entre le dernier mois réel et le dernier mois prévu. */
  readonly projectedChange: number;
  /** Pente du modèle de Holt, en euros par m² et par mois. */
  readonly monthlyTrend: number;
  /** Largeur totale de l'intervalle au dernier point prévu, en fraction de la valeur. */
  readonly intervalWidth: number;
  readonly lastActualMonth: string;
  readonly lastActual: number;
  readonly historyLength: number;
}

export interface ForecastResult {
  readonly points: readonly ForecastSeriesPoint[];
  readonly summary: ForecastSummary;
}

const EMPTY_SUMMARY: ForecastSummary = {
  projectedChange: Number.NaN,
  monthlyTrend: Number.NaN,
  intervalWidth: Number.NaN,
  lastActualMonth: '',
  lastActual: Number.NaN,
  historyLength: 0,
};

/** Nombre minimal de points mensuels pour que le lissage de Holt ait un sens. */
const MIN_HISTORY = 6;

/** Fenêtre de lissage visuel, en mois. */
const SMOOTHING_WINDOW = 3;

/** Décale un mois ISO "YYYY-MM" de `delta` mois, sans passer par Date. */
export function shiftMonth(month: string, delta: number): string {
  const [yearPart, monthPart] = month.split('-');
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) return month;
  const absolute = year * 12 + (monthNumber - 1) + delta;
  const shiftedYear = Math.floor(absolute / 12);
  const shiftedMonth = absolute - shiftedYear * 12 + 1;
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, '0')}`;
}

interface MonthPoint {
  readonly month: string;
  readonly value: number;
  readonly transactions: number;
}

/**
 * Agrège les lignes mensuelles en une série unique.
 * Quand plusieurs lignes partagent un mois (filtre "Tous"), la médiane du m² est
 * moyennée en pondérant par le volume : un département de 20 ventes ne pèse pas
 * autant qu'un département de 2 000.
 */
function aggregateByMonth(
  monthlyStats: readonly MonthlyStat[],
  department: string,
  propertyType: TypeFilter,
): readonly MonthPoint[] {
  const buckets = new Map<string, { weighted: number; transactions: number }>();
  for (const row of monthlyStats) {
    if (department !== ALL && row.departmentCode !== department) continue;
    if (propertyType !== ALL && row.propertyType !== propertyType) continue;
    const weight = Math.max(1, row.transactions);
    const bucket = buckets.get(row.month);
    if (bucket) {
      bucket.weighted += row.medianPricePerSqm * weight;
      bucket.transactions += weight;
    } else {
      buckets.set(row.month, { weighted: row.medianPricePerSqm * weight, transactions: weight });
    }
  }
  return [...buckets.entries()]
    .map(([month, bucket]) => ({
      month,
      value: bucket.weighted / bucket.transactions,
      transactions: bucket.transactions,
    }))
    .toSorted((a, b) => a.month.localeCompare(b.month));
}

/**
 * Série historique + projection à `horizon` mois du prix médian au m².
 *
 * Le modèle est un lissage exponentiel double de Holt appliqué à la série brute ;
 * la moyenne mobile n'intervient que sur la courbe affichée, jamais sur l'ajustement.
 * Le point du dernier mois réel porte aussi les champs de prévision, pour que la
 * courbe pointillée parte du prix observé et non d'un trou dans le graphique.
 */
export function buildForecast(
  monthlyStats: readonly MonthlyStat[],
  filter: ForecastFilter,
  horizon = 12,
): ForecastResult {
  const series = aggregateByMonth(monthlyStats, filter.department, filter.propertyType);
  if (series.length < MIN_HISTORY || horizon <= 0) {
    return { points: [], summary: EMPTY_SUMMARY };
  }

  const raw = series.map((point) => point.value);
  const displayed = filter.smooth === true ? movingAverage(raw, SMOOTHING_WINDOW) : raw;
  const holt = holtForecast(raw, horizon);

  const lastIndex = series.length - 1;
  const lastPoint = series[lastIndex];
  const lastActual = raw[lastIndex];
  if (lastPoint === undefined || lastActual === undefined) {
    return { points: [], summary: EMPTY_SUMMARY };
  }

  const points: ForecastSeriesPoint[] = series.map((point, index) => {
    const actual = displayed[index] ?? point.value;
    const fitted = holt.fitted[index];
    const base: ForecastSeriesPoint =
      fitted === undefined
        ? { month: point.month, actual, kind: 'history' }
        : { month: point.month, actual, fitted, kind: 'history' };
    // Raccord visuel : le dernier point réel est aussi l'origine de la projection.
    return index === lastIndex
      ? { ...base, forecast: lastActual, low: lastActual, high: lastActual }
      : base;
  });

  for (const step of holt.forecast) {
    points.push({
      month: shiftMonth(lastPoint.month, step.step),
      forecast: step.value,
      low: step.low,
      high: step.high,
      kind: 'forecast',
    });
  }

  const last = holt.forecast[holt.forecast.length - 1];
  const summary: ForecastSummary = {
    projectedChange: last === undefined ? Number.NaN : relativeChange(last.value, lastActual),
    monthlyTrend: holt.trend,
    intervalWidth:
      last === undefined || last.value === 0 ? Number.NaN : (last.high - last.low) / last.value,
    lastActualMonth: lastPoint.month,
    lastActual,
    historyLength: series.length,
  };

  return { points, summary };
}

// ---------------------------------------------------------------------------
// Estimation hédonique
// ---------------------------------------------------------------------------

export type Confidence = 'haute' | 'moyenne' | 'faible';

export interface EstimateInput {
  readonly inseeCode: string;
  readonly propertyType: PropertyType;
  readonly surface: number;
  readonly rooms: number;
}

export interface EstimateResult {
  readonly estimate: Estimate;
  readonly pricePerSqm: number;
  /** Les cinq mutations de la commune les plus proches en surface. */
  readonly comparables: readonly Transaction[];
  readonly elasticity: number;
  /** Nombre de mutations comparables dans la commune, base de l'indice de confiance. */
  readonly sampleSize: number;
  readonly confidence: Confidence;
}

/** Au-delà de ce nombre de ventes locales, la dispersion communale est jugée fiable. */
const LOCAL_SAMPLE_THRESHOLD = 15;
const HIGH_CONFIDENCE_SAMPLE = 40;
const COMPARABLES_COUNT = 5;

/** Surface médiane de repli quand l'échantillon est trop mince pour la calculer. */
const FALLBACK_MEDIAN_SURFACE: Readonly<Record<PropertyType, number>> = {
  appartement: 55,
  maison: 105,
};

function confidenceOf(sampleSize: number): Confidence {
  if (sampleSize >= HIGH_CONFIDENCE_SAMPLE) return 'haute';
  if (sampleSize >= LOCAL_SAMPLE_THRESHOLD) return 'moyenne';
  return 'faible';
}

/**
 * Estimation d'un bien : médiane communale au m², corrigée de l'élasticité de surface
 * mesurée sur le département, avec un intervalle tiré de la dispersion locale observée.
 *
 * Renvoie null quand la commune et le type demandés n'existent pas dans les agrégats :
 * mieux vaut un état vide explicite qu'un prix inventé.
 */
export function estimate(
  input: EstimateInput,
  communeStats: readonly CommuneStat[],
  transactions: readonly Transaction[],
): EstimateResult | null {
  const stat = communeStats.find(
    (row) => row.inseeCode === input.inseeCode && row.propertyType === input.propertyType,
  );
  if (stat === undefined) return null;

  const localSales = transactions.filter(
    (row) => row.inseeCode === input.inseeCode && row.propertyType === input.propertyType,
  );
  const departmentSales = transactions.filter(
    (row) =>
      row.departmentCode === stat.departmentCode && row.propertyType === input.propertyType,
  );
  const sampleSize = localSales.length;

  // La dispersion vient de la commune si elle est assez fournie, sinon du département.
  const dispersionSource = sampleSize >= LOCAL_SAMPLE_THRESHOLD ? localSales : departmentSales;
  const pricesPerSqm = dispersionSource.map((row) => row.pricePerSqm);
  const p10 = quantile(pricesPerSqm, 0.1);
  const p90 = quantile(pricesPerSqm, 0.9);
  const dispersion =
    Number.isFinite(p10) && Number.isFinite(p90) && stat.medianPricePerSqm > 0
      ? (p90 - p10) / stat.medianPricePerSqm
      : Number.NaN;

  const surfaces = dispersionSource.map((row) => row.surface);
  const medianSurface = surfaces.length > 0 ? median(surfaces) : Number.NaN;

  const fit = priceSurfaceElasticity(
    departmentSales.map((row) => ({ price: row.price, surface: row.surface })),
  );

  const result = estimatePrice({
    surface: input.surface,
    rooms: input.rooms,
    medianPricePerSqm: stat.medianPricePerSqm,
    medianSurface: Number.isFinite(medianSurface)
      ? medianSurface
      : FALLBACK_MEDIAN_SURFACE[input.propertyType],
    elasticity: fit.slope,
    dispersion: Number.isFinite(dispersion) ? dispersion : 0.5,
  });

  const comparables = localSales
    .toSorted(
      (a, b) => Math.abs(a.surface - input.surface) - Math.abs(b.surface - input.surface),
    )
    .slice(0, COMPARABLES_COUNT);

  return {
    estimate: result,
    pricePerSqm: input.surface > 0 ? result.value / input.surface : Number.NaN,
    comparables,
    elasticity: fit.slope,
    sampleSize,
    confidence: confidenceOf(sampleSize),
  };
}

// ---------------------------------------------------------------------------
// Anomalies de marché
// ---------------------------------------------------------------------------

export interface MarketAnomaly {
  readonly transaction: Transaction;
  /** Score z robuste au sein du couple commune × type. */
  readonly score: number;
  readonly direction: AnomalyDirection;
  readonly groupMedian: number;
  /** Écart au prix médian du groupe, en fraction. */
  readonly deviation: number;
}

/** Le tableau ne montre que les écarts les plus francs : au-delà, la lecture se perd. */
const MAX_ANOMALIES = 30;

const anomalyGroupKey = (row: Transaction): string => `${row.inseeCode}:${row.propertyType}`;

/**
 * Sous- et surévaluations détectées par z-score robuste (MAD) sur le prix au m²,
 * groupées par commune et type de bien pour ne pas confondre "cher" et "anormal".
 */
export function marketAnomalies(
  transactions: readonly Transaction[],
  threshold = 3,
): readonly MarketAnomaly[] {
  const groups = new Map<string, number[]>();
  for (const row of transactions) {
    const key = anomalyGroupKey(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row.pricePerSqm);
    else groups.set(key, [row.pricePerSqm]);
  }
  const medians = new Map<string, number>();
  for (const [key, values] of groups) medians.set(key, median(values));

  return detectAnomalies(transactions, {
    value: (row) => row.pricePerSqm,
    groupBy: anomalyGroupKey,
    threshold,
  })
    .slice(0, MAX_ANOMALIES)
    .map((anomaly) => {
      const groupMedian = medians.get(anomalyGroupKey(anomaly.item)) ?? Number.NaN;
      return {
        transaction: anomaly.item,
        score: anomaly.score,
        direction: anomaly.direction,
        groupMedian,
        deviation: relativeChange(anomaly.item.pricePerSqm, groupMedian),
      };
    });
}

// ---------------------------------------------------------------------------
// Phases de marché
// ---------------------------------------------------------------------------

export type MarketPhase = 'expansion' | 'surchauffe' | 'correction' | 'reprise';

export interface DepartmentMomentum {
  readonly departmentCode: string;
  readonly departmentName: string;
  /** Variation du prix médian au m², 12 derniers mois contre les 12 précédents. */
  readonly priceChange: number;
  /** Variation du volume de transactions, même comparaison. */
  readonly volumeChange: number;
  readonly phase: MarketPhase;
}

/** Seuil de hausse de prix au-delà duquel un marché sans volume est dit en surchauffe. */
const OVERHEATING_PRICE_CHANGE = 0.04;

/** Fenêtre de comparaison, en mois. */
const MOMENTUM_WINDOW = 12;

/**
 * Quadrant prix × volume. Le volume décroche avant les prix : c'est le croisement
 * des deux signes qui situe un marché dans son cycle, pas le prix seul.
 */
export function marketPhase(priceChange: number, volumeChange: number): MarketPhase {
  if (priceChange > OVERHEATING_PRICE_CHANGE && volumeChange < 0) return 'surchauffe';
  if (priceChange > 0 && volumeChange > 0) return 'expansion';
  if (priceChange < 0 && volumeChange < 0) return 'correction';
  if (priceChange < 0 && volumeChange > 0) return 'reprise';
  // Cas résiduels (une variation nulle, ou une hausse modérée sans volume).
  if (priceChange > 0) return 'surchauffe';
  return volumeChange > 0 ? 'reprise' : 'correction';
}

const weightedPrice = (rows: readonly MonthPoint[]): number => {
  let weighted = 0;
  let weight = 0;
  for (const row of rows) {
    weighted += row.value * row.transactions;
    weight += row.transactions;
  }
  return weight === 0 ? Number.NaN : weighted / weight;
};

const totalVolume = (rows: readonly MonthPoint[]): number =>
  rows.reduce((acc, row) => acc + row.transactions, 0);

/** Momentum prix et volume par département, avec la phase de marché correspondante. */
export function momentumByDepartment(
  monthlyStats: readonly MonthlyStat[],
): readonly DepartmentMomentum[] {
  const codes = [...new Set(monthlyStats.map((row) => row.departmentCode))].toSorted();
  const rows: DepartmentMomentum[] = [];

  for (const code of codes) {
    const series = aggregateByMonth(monthlyStats, code, ALL);
    if (series.length < MOMENTUM_WINDOW * 2) continue;
    const recent = series.slice(-MOMENTUM_WINDOW);
    const previous = series.slice(-MOMENTUM_WINDOW * 2, -MOMENTUM_WINDOW);
    const priceChange = relativeChange(weightedPrice(recent), weightedPrice(previous));
    const volumeChange = relativeChange(totalVolume(recent), totalVolume(previous));
    if (!Number.isFinite(priceChange) || !Number.isFinite(volumeChange)) continue;
    rows.push({
      departmentCode: code,
      departmentName: findDepartment(code)?.name ?? code,
      priceChange,
      volumeChange,
      phase: marketPhase(priceChange, volumeChange),
    });
  }

  return rows;
}
