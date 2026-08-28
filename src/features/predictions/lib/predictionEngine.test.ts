import { describe, expect, it } from 'vitest';
import { generateCommuneStats } from '@/shared/mocks/communeStats';
import { generateMonthlyStats } from '@/shared/mocks/monthlyStats';
import { generateTransactions } from '@/shared/mocks/transactions';
import { DEPARTMENTS } from '@/shared/mocks/departments';
import type { MonthlyStat, PropertyType } from '@/shared/types/dvf';
import {
  ALL,
  buildForecast,
  estimate,
  marketAnomalies,
  marketPhase,
  momentumByDepartment,
  shiftMonth,
} from './predictionEngine';

const monthlyStats = generateMonthlyStats();
const communeStats = generateCommuneStats();
const transactions = generateTransactions();

/** Série mensuelle synthétique : un seul département, un seul type, croissance linéaire. */
function syntheticSeries(options: {
  readonly months: number;
  readonly start: string;
  readonly base: number;
  readonly step: number;
  readonly transactions?: number;
  readonly departmentCode?: string;
  readonly propertyType?: PropertyType;
}): readonly MonthlyStat[] {
  const propertyType = options.propertyType ?? 'appartement';
  return Array.from({ length: options.months }, (_, index) => {
    const price = options.base + index * options.step;
    const count = options.transactions ?? 100;
    return {
      month: shiftMonth(options.start, index),
      departmentCode: options.departmentCode ?? '99',
      propertyType,
      transactions: count,
      medianPricePerSqm: price,
      p10PricePerSqm: price * 0.62,
      p90PricePerSqm: price * 1.55,
      medianSurface: 55,
      totalValue: count * price * 55,
    } satisfies MonthlyStat;
  });
}

describe('shiftMonth', () => {
  it('avance et recule sans passer par Date', () => {
    expect(shiftMonth('2026-07', 1)).toBe('2026-08');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-07', 12)).toBe('2027-07');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('renvoie l entrée telle quelle si elle n est pas un mois ISO', () => {
    expect(shiftMonth('sans-mois', 3)).toBe('sans-mois');
  });
});

describe('buildForecast', () => {
  const series = syntheticSeries({ months: 24, start: '2024-08', base: 4000, step: 20 });

  it('produit l historique puis l horizon demandé', () => {
    const { points, summary } = buildForecast(
      series,
      { department: '99', propertyType: 'appartement' },
      12,
    );
    expect(points).toHaveLength(36);
    expect(points.filter((p) => p.kind === 'history')).toHaveLength(24);
    expect(points.filter((p) => p.kind === 'forecast')).toHaveLength(12);
    expect(summary.historyLength).toBe(24);
    expect(summary.lastActualMonth).toBe('2026-07');
    expect(summary.lastActual).toBeCloseTo(4460, 6);
  });

  it('génère les mois futurs à partir du dernier mois réel', () => {
    const { points } = buildForecast(series, { department: '99', propertyType: 'appartement' }, 3);
    const future = points.filter((p) => p.kind === 'forecast').map((p) => p.month);
    expect(future).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('raccorde la projection au dernier point réel', () => {
    const { points } = buildForecast(series, { department: '99', propertyType: 'appartement' });
    const bridge = points.findLast((p) => p.kind === 'history');
    expect(bridge?.forecast).toBe(bridge?.actual);
    expect(bridge?.low).toBe(bridge?.actual);
    expect(bridge?.high).toBe(bridge?.actual);
  });

  it('prolonge une tendance linéaire et encadre la prévision', () => {
    const { points, summary } = buildForecast(
      series,
      { department: '99', propertyType: 'appartement' },
      12,
    );
    const last = points.at(-1);
    expect(last?.kind).toBe('forecast');
    expect(last?.forecast ?? 0).toBeGreaterThan(summary.lastActual);
    expect(last?.low ?? 0).toBeLessThanOrEqual(last?.forecast ?? 0);
    expect(last?.high ?? 0).toBeGreaterThanOrEqual(last?.forecast ?? 0);
    expect(summary.projectedChange).toBeGreaterThan(0);
    expect(summary.monthlyTrend).toBeCloseTo(20, 1);
    expect(summary.intervalWidth).toBeGreaterThanOrEqual(0);
  });

  it('agrège les types de biens en pondérant par les transactions', () => {
    const cheap = syntheticSeries({
      months: 12,
      start: '2025-08',
      base: 1000,
      step: 0,
      transactions: 300,
      propertyType: 'maison',
    });
    const expensive = syntheticSeries({
      months: 12,
      start: '2025-08',
      base: 5000,
      step: 0,
      transactions: 100,
      propertyType: 'appartement',
    });
    const { points } = buildForecast([...cheap, ...expensive], {
      department: '99',
      propertyType: ALL,
    });
    // (1000 × 300 + 5000 × 100) / 400 = 2000
    expect(points[0]?.actual).toBeCloseTo(2000, 6);
  });

  it('lisse la courbe affichée sans déplacer le modèle', () => {
    const noisy = syntheticSeries({ months: 12, start: '2025-08', base: 4000, step: 0 }).map(
      (row, index): MonthlyStat =>
        index === 5 ? { ...row, medianPricePerSqm: 5200 } : row,
    );
    const rawResult = buildForecast(noisy, { department: '99', propertyType: 'appartement' });
    const smoothed = buildForecast(noisy, {
      department: '99',
      propertyType: 'appartement',
      smooth: true,
    });
    expect(rawResult.points[5]?.actual).toBe(5200);
    expect(smoothed.points[5]?.actual).toBeCloseTo(4400, 6);
    expect(smoothed.summary.monthlyTrend).toBeCloseTo(rawResult.summary.monthlyTrend, 9);
  });

  it('reste vide quand l historique est trop court ou l horizon nul', () => {
    expect(buildForecast([], { department: ALL, propertyType: ALL }).points).toEqual([]);
    const shortSeries = syntheticSeries({ months: 3, start: '2026-05', base: 4000, step: 10 });
    expect(
      buildForecast(shortSeries, { department: '99', propertyType: 'appartement' }).points,
    ).toEqual([]);
    expect(
      buildForecast(series, { department: '99', propertyType: 'appartement' }, 0).points,
    ).toEqual([]);
  });

  it('fonctionne sur le jeu de démonstration complet', () => {
    const { points, summary } = buildForecast(monthlyStats, {
      department: '75',
      propertyType: 'appartement',
    });
    expect(points.filter((p) => p.kind === 'history')).toHaveLength(36);
    expect(summary.lastActualMonth).toBe('2026-07');
    expect(Number.isFinite(summary.projectedChange)).toBe(true);
    expect(Number.isFinite(summary.intervalWidth)).toBe(true);
  });
});

describe('estimate', () => {
  const paris = communeStats.find(
    (row) => row.departmentCode === '75' && row.propertyType === 'appartement',
  );

  it('renvoie une estimation encadrée et un prix au m² cohérent', () => {
    expect(paris).toBeDefined();
    const result = estimate(
      { inseeCode: paris?.inseeCode ?? '', propertyType: 'appartement', surface: 60, rooms: 3 },
      communeStats,
      transactions,
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.estimate.value).toBeGreaterThan(0);
    expect(result.estimate.low).toBeLessThan(result.estimate.value);
    expect(result.estimate.high).toBeGreaterThan(result.estimate.value);
    expect(result.pricePerSqm).toBeCloseTo(result.estimate.value / 60, 6);
    expect(result.elasticity).toBeGreaterThan(0.5);
    expect(result.elasticity).toBeLessThan(1.2);
  });

  it('classe la confiance selon la taille de l échantillon local', () => {
    for (const stat of communeStats.slice(0, 20)) {
      const result = estimate(
        { inseeCode: stat.inseeCode, propertyType: stat.propertyType, surface: 70, rooms: 3 },
        communeStats,
        transactions,
      );
      if (!result) continue;
      const expected =
        result.sampleSize >= 40 ? 'haute' : result.sampleSize >= 15 ? 'moyenne' : 'faible';
      expect(result.confidence).toBe(expected);
    }
  });

  it('retient au plus cinq comparables, les plus proches en surface', () => {
    const result = estimate(
      { inseeCode: paris?.inseeCode ?? '', propertyType: 'appartement', surface: 60, rooms: 3 },
      communeStats,
      transactions,
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.comparables.length).toBeLessThanOrEqual(5);
    for (const comparable of result.comparables) {
      expect(comparable.inseeCode).toBe(paris?.inseeCode);
      expect(comparable.propertyType).toBe('appartement');
    }
    const distances = result.comparables.map((row) => Math.abs(row.surface - 60));
    expect(distances).toEqual(distances.toSorted((a, b) => a - b));
  });

  it('fait croître l estimation avec la surface', () => {
    const of = (surface: number): number =>
      estimate(
        { inseeCode: paris?.inseeCode ?? '', propertyType: 'appartement', surface, rooms: 3 },
        communeStats,
        transactions,
      )?.estimate.value ?? 0;
    expect(of(80)).toBeGreaterThan(of(40));
  });

  it('renvoie null pour une commune inconnue', () => {
    expect(
      estimate(
        { inseeCode: '00000', propertyType: 'appartement', surface: 60, rooms: 3 },
        communeStats,
        transactions,
      ),
    ).toBeNull();
  });
});

describe('marketAnomalies', () => {
  const anomalies = marketAnomalies(transactions);

  it('renvoie au plus trente lignes au-delà du seuil', () => {
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.length).toBeLessThanOrEqual(30);
    for (const anomaly of anomalies) {
      expect(Math.abs(anomaly.score)).toBeGreaterThanOrEqual(3);
    }
  });

  it('trie par écart décroissant et accorde direction et signe', () => {
    const scores = anomalies.map((a) => Math.abs(a.score));
    expect(scores).toEqual(scores.toSorted((a, b) => b - a));
    for (const anomaly of anomalies) {
      expect(anomaly.groupMedian).toBeGreaterThan(0);
      if (anomaly.direction === 'over') {
        expect(anomaly.deviation).toBeGreaterThan(0);
        expect(anomaly.transaction.pricePerSqm).toBeGreaterThan(anomaly.groupMedian);
      } else {
        expect(anomaly.deviation).toBeLessThan(0);
        expect(anomaly.transaction.pricePerSqm).toBeLessThan(anomaly.groupMedian);
      }
    }
  });

  it('se resserre quand le seuil monte', () => {
    expect(marketAnomalies(transactions, 6).length).toBeLessThanOrEqual(anomalies.length);
    expect(marketAnomalies([])).toEqual([]);
  });
});

describe('marketPhase', () => {
  it('place chaque couple de variations dans son quadrant', () => {
    expect(marketPhase(0.02, 0.05)).toBe('expansion');
    expect(marketPhase(0.06, -0.05)).toBe('surchauffe');
    expect(marketPhase(-0.03, -0.08)).toBe('correction');
    expect(marketPhase(-0.02, 0.09)).toBe('reprise');
  });

  it('reste total sur les cas limites', () => {
    expect(marketPhase(0.01, -0.02)).toBe('surchauffe');
    expect(marketPhase(0, 0.05)).toBe('reprise');
    expect(marketPhase(0, 0)).toBe('correction');
  });
});

describe('momentumByDepartment', () => {
  const momentum = momentumByDepartment(monthlyStats);

  it('couvre chaque département du jeu', () => {
    expect(momentum).toHaveLength(DEPARTMENTS.length);
    expect(momentum.map((row) => row.departmentCode)).toEqual(
      DEPARTMENTS.map((d) => d.code).toSorted(),
    );
    for (const row of momentum) {
      expect(row.departmentName).not.toBe(row.departmentCode);
      expect(Number.isFinite(row.priceChange)).toBe(true);
      expect(Number.isFinite(row.volumeChange)).toBe(true);
      expect(row.phase).toBe(marketPhase(row.priceChange, row.volumeChange));
    }
  });

  it('retrouve le sens de la tendance annuelle du département', () => {
    const paris = momentum.find((row) => row.departmentCode === '75');
    const herault = momentum.find((row) => row.departmentCode === '34');
    expect(paris?.priceChange ?? 0).toBeLessThan(0);
    expect(herault?.priceChange ?? 0).toBeGreaterThan(0);
  });

  it('ignore un historique trop court', () => {
    const shortSeries = syntheticSeries({ months: 12, start: '2025-08', base: 4000, step: 10 });
    expect(momentumByDepartment(shortSeries)).toEqual([]);
    expect(momentumByDepartment([])).toEqual([]);
  });
});
