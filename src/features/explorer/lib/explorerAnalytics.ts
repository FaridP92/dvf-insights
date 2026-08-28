import {
  correlationMatrix,
  describe,
  histogram,
  priceSurfaceElasticity,
  quantile,
  type CorrelationCell,
  type Distribution,
  type LinearFit,
} from '@/lib/stats';
import type { PropertyType, Transaction } from '@/shared/types/dvf';
import type { ExplorerFilters } from '../hooks/useExplorerFilters';

/**
 * Dérivations de l'explorateur : toutes pures, toutes testées, aucune dépendance à React.
 * Les composants se contentent de les mémoïser, ce qui garde le rendu prévisible et
 * permet de raisonner sur les statistiques sans monter un arbre de composants.
 */

const DAY_MS = 86_400_000;
const AVERAGE_DAYS_PER_MONTH = 30.44;

/** Nombre de pièces à partir duquel le filtre "4" agrège tout le haut de la distribution. */
const ROOMS_OPEN_BUCKET = 4;

// ---------------------------------------------------------------------------
// Filtrage
// ---------------------------------------------------------------------------

/**
 * Applique le panneau de filtres à l'échantillon de mutations.
 * `now` est injecté plutôt que lu depuis l'horloge : une fonction pure se teste,
 * et la page passe la date la plus récente du jeu de données, pas l'heure du navigateur.
 */
export function applyFilters(
  transactions: readonly Transaction[],
  filters: ExplorerFilters,
  now: Date,
): readonly Transaction[] {
  const months = Number(filters.period);
  const floor = new Date(now.getTime() - months * AVERAGE_DAYS_PER_MONTH * DAY_MS)
    .toISOString()
    .slice(0, 10);

  return transactions.filter((t) => {
    if (t.date < floor) return false;
    if (filters.propertyType !== 'tous' && t.propertyType !== filters.propertyType) return false;
    if (filters.surfaceMin !== null && t.surface < filters.surfaceMin) return false;
    if (filters.surfaceMax !== null && t.surface > filters.surfaceMax) return false;
    if (filters.priceMin !== null && t.price < filters.priceMin) return false;
    if (filters.priceMax !== null && t.price > filters.priceMax) return false;
    if (filters.rooms !== 'toutes') {
      const wanted = Number(filters.rooms);
      const matches = wanted === ROOMS_OPEN_BUCKET ? t.rooms >= wanted : t.rooms === wanted;
      if (!matches) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Distribution du prix au m²
// ---------------------------------------------------------------------------

export interface PriceBin {
  readonly x0: number;
  readonly x1: number;
  readonly count: number;
  /** Part de l'effectif classé, dans [0, 1]. */
  readonly share: number;
  /** Étiquette d'axe : borne basse de la classe. */
  readonly label: number;
}

export interface PriceDistribution {
  readonly bins: readonly PriceBin[];
  readonly stats: Distribution;
}

/**
 * Histogramme du prix au m².
 *
 * Les bornes sont resserrées sur l'intervalle P1-P99 : l'échantillon contient environ 2 %
 * de mutations volontairement aberrantes, et sur l'amplitude brute elles écrasent
 * les vingt premières classes contre l'axe. Les valeurs exclues restent comptées dans
 * `stats`, calculé sur la totalité de la sélection.
 */
export function priceDistribution(
  transactions: readonly Transaction[],
  bins = 24,
): PriceDistribution {
  const values = transactions.map((t) => t.pricePerSqm);
  const stats = describe(values);
  if (values.length === 0) return { bins: [], stats };

  const min = quantile(values, 0.01);
  const max = quantile(values, 0.99);
  const raw = histogram(values, bins, { min, max });
  const classified = raw.reduce((sum, bin) => sum + bin.count, 0);

  return {
    bins: raw.map((bin) => ({
      x0: bin.x0,
      x1: bin.x1,
      count: bin.count,
      share: classified === 0 ? 0 : bin.count / classified,
      label: bin.x0,
    })),
    stats,
  };
}

// ---------------------------------------------------------------------------
// Nuage surface / prix et droite d'élasticité
// ---------------------------------------------------------------------------

export interface ScatterPoint {
  readonly id: string;
  readonly surface: number;
  readonly price: number;
  readonly pricePerSqm: number;
  readonly communeName: string;
  readonly propertyType: PropertyType;
}

export interface ElasticityLinePoint {
  readonly surface: number;
  readonly price: number;
}

export interface SurfacePriceScatter {
  readonly points: readonly ScatterPoint[];
  readonly fit: LinearFit;
  /** Deux extrémités de la droite log-log ramenée en espace linéaire, ou [] si non calculable. */
  readonly line: readonly ElasticityLinePoint[];
  /** Nombre de mutations réellement utilisées pour la régression. */
  readonly sampled: number;
}

/**
 * Nuage surface × prix, échantillonné et accompagné de sa droite d'élasticité.
 *
 * L'échantillonnage prend une mutation sur k plutôt qu'un tirage aléatoire : le rendu est
 * déterministe d'une session à l'autre, et comme l'échantillon d'origine est trié par date
 * le pas régulier ne privilégie aucune période. La régression, elle, porte sur la totalité
 * de la sélection : réduire le nuage est un choix d'affichage, pas de statistique.
 */
export function surfacePriceScatter(
  transactions: readonly Transaction[],
  maxPoints = 800,
): SurfacePriceScatter {
  const fit = priceSurfaceElasticity(transactions);
  const step = maxPoints > 0 ? Math.max(1, Math.ceil(transactions.length / maxPoints)) : 1;
  const points: ScatterPoint[] = [];
  for (let i = 0; i < transactions.length; i += step) {
    const t = transactions[i];
    if (t === undefined) continue;
    points.push({
      id: t.id,
      surface: t.surface,
      price: t.price,
      pricePerSqm: t.pricePerSqm,
      communeName: t.communeName,
      propertyType: t.propertyType,
    });
  }

  const surfaces = points.map((p) => p.surface);
  const canDrawLine =
    surfaces.length >= 2 && Number.isFinite(fit.slope) && Number.isFinite(fit.intercept);
  if (!canDrawLine) return { points, fit, line: [], sampled: transactions.length };

  // log(prix) = intercept + slope × log(surface) donc prix = exp(intercept) × surface^slope.
  const scale = Math.exp(fit.intercept);
  const xMin = Math.min(...surfaces);
  const xMax = Math.max(...surfaces);
  const line: readonly ElasticityLinePoint[] = [
    { surface: xMin, price: scale * xMin ** fit.slope },
    { surface: xMax, price: scale * xMax ** fit.slope },
  ];
  return { points, fit, line, sampled: transactions.length };
}

// ---------------------------------------------------------------------------
// Corrélations
// ---------------------------------------------------------------------------

export const CORRELATION_VARIABLES = ['Prix', 'Surface', 'Pièces', 'Terrain', 'Prix/m²'] as const;

/** Matrice de Pearson 5×5 sur les variables continues de la sélection. */
export function correlations(transactions: readonly Transaction[]): readonly CorrelationCell[] {
  return correlationMatrix({
    Prix: transactions.map((t) => t.price),
    Surface: transactions.map((t) => t.surface),
    Pièces: transactions.map((t) => t.rooms),
    Terrain: transactions.map((t) => t.landSurface),
    'Prix/m²': transactions.map((t) => t.pricePerSqm),
  });
}

// ---------------------------------------------------------------------------
// Structure du marché
// ---------------------------------------------------------------------------

export interface SurfaceBandRow {
  readonly band: string;
  readonly appartement: number;
  readonly maison: number;
  readonly total: number;
}

const SURFACE_BANDS: ReadonlyArray<{ readonly label: string; readonly max: number }> = [
  { label: '< 30 m²', max: 30 },
  { label: '30-50 m²', max: 50 },
  { label: '50-70 m²', max: 70 },
  { label: '70-100 m²', max: 100 },
  { label: '100-150 m²', max: 150 },
  { label: '> 150 m²', max: Number.POSITIVE_INFINITY },
];

export const SURFACE_BAND_LABELS: readonly string[] = SURFACE_BANDS.map((b) => b.label);

/** Répartition en effectifs par type de bien et tranche de surface bâtie. */
export function structureBySurfaceBand(
  transactions: readonly Transaction[],
): readonly SurfaceBandRow[] {
  const counts = SURFACE_BANDS.map(() => ({ appartement: 0, maison: 0 }));
  for (const t of transactions) {
    const index = SURFACE_BANDS.findIndex((band) => t.surface < band.max);
    const bucket = counts[index === -1 ? counts.length - 1 : index];
    if (bucket === undefined) continue;
    bucket[t.propertyType] += 1;
  }
  return SURFACE_BANDS.map((band, i) => {
    const bucket = counts[i] ?? { appartement: 0, maison: 0 };
    return {
      band: band.label,
      appartement: bucket.appartement,
      maison: bucket.maison,
      total: bucket.appartement + bucket.maison,
    };
  });
}

// ---------------------------------------------------------------------------
// Classement des communes
// ---------------------------------------------------------------------------

export interface CommuneRankingRow {
  readonly inseeCode: string;
  readonly communeName: string;
  readonly departmentCode: string;
  readonly departmentName: string;
  readonly transactions: number;
  readonly medianPricePerSqm: number;
  readonly p25PricePerSqm: number;
  readonly p75PricePerSqm: number;
  readonly medianSurface: number;
}

/** Nombre de communes affichées : au-delà, le tableau cesse d'être un classement. */
export const COMMUNE_RANKING_LIMIT = 15;

/**
 * Classement des communes de la sélection, par volume décroissant.
 * La fourchette P25-P75 accompagne la médiane : deux communes au même prix médian
 * n'ont pas le même marché si l'une est deux fois plus dispersée.
 */
export function communeRanking(
  transactions: readonly Transaction[],
  limit = COMMUNE_RANKING_LIMIT,
  departmentNames?: ReadonlyMap<string, string>,
): readonly CommuneRankingRow[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const bucket = groups.get(t.inseeCode);
    if (bucket) bucket.push(t);
    else groups.set(t.inseeCode, [t]);
  }

  const rows: CommuneRankingRow[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (first === undefined) continue;
    const prices = group.map((t) => t.pricePerSqm);
    const surfaces = group.map((t) => t.surface);
    rows.push({
      inseeCode: first.inseeCode,
      communeName: first.communeName,
      departmentCode: first.departmentCode,
      departmentName: departmentNames?.get(first.departmentCode) ?? first.departmentCode,
      transactions: group.length,
      medianPricePerSqm: quantile(prices, 0.5),
      p25PricePerSqm: quantile(prices, 0.25),
      p75PricePerSqm: quantile(prices, 0.75),
      medianSurface: quantile(surfaces, 0.5),
    });
  }

  return rows
    .toSorted(
      (a, b) => b.transactions - a.transactions || a.communeName.localeCompare(b.communeName),
    )
    .slice(0, limit);
}
