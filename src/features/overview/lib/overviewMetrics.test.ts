import { describe, expect, it } from 'vitest';
import type { CommuneStat, Department, MonthlyStat, PropertyType } from '@/shared/types/dvf';
import {
  ALL_FILTER,
  aggregateMonthly,
  computeHeadline,
  toBase100,
  toRegionBase100,
  topMovers,
  type MonthlyPoint,
} from './overviewMetrics';

function stat(overrides: Partial<MonthlyStat> & Pick<MonthlyStat, 'month'>): MonthlyStat {
  return {
    departmentCode: '75',
    propertyType: 'appartement',
    transactions: 100,
    medianPricePerSqm: 5000,
    p10PricePerSqm: 3000,
    p90PricePerSqm: 8000,
    medianSurface: 55,
    totalValue: 1_000_000,
    ...overrides,
  };
}

function commune(overrides: Partial<CommuneStat> & Pick<CommuneStat, 'inseeCode'>): CommuneStat {
  return {
    communeName: `Commune ${overrides.inseeCode}`,
    departmentCode: '75',
    propertyType: 'appartement',
    transactions: 100,
    medianPricePerSqm: 5000,
    yoyChange: 0,
    tensionIndex: 5,
    lat: 0,
    lng: 0,
    ...overrides,
  };
}

/** Série synthétique de `count` mois consécutifs à partir de janvier 2023. */
function series(count: number, build: (index: number) => Partial<MonthlyPoint>): MonthlyPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    month: `${2023 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`,
    transactions: 100,
    medianPricePerSqm: 5000,
    p10PricePerSqm: 3000,
    p90PricePerSqm: 8000,
    totalValue: 1_000_000,
    ...build(index),
  }));
}

describe('aggregateMonthly', () => {
  const rows: readonly MonthlyStat[] = [
    stat({ month: '2024-02', departmentCode: '75', transactions: 100, medianPricePerSqm: 9000 }),
    stat({ month: '2024-01', departmentCode: '75', transactions: 100, medianPricePerSqm: 10_000 }),
    stat({ month: '2024-01', departmentCode: '59', transactions: 300, medianPricePerSqm: 2000 }),
    stat({
      month: '2024-01',
      departmentCode: '59',
      propertyType: 'maison',
      transactions: 100,
      medianPricePerSqm: 1000,
    }),
  ];

  it('trie les mois du plus ancien au plus récent', () => {
    expect(aggregateMonthly(rows, { department: ALL_FILTER, propertyType: ALL_FILTER })).toHaveLength(2);
    expect(
      aggregateMonthly(rows, { department: ALL_FILTER, propertyType: ALL_FILTER }).map((p) => p.month),
    ).toEqual(['2024-01', '2024-02']);
  });

  it('pondère le prix médian par les transactions et additionne les volumes', () => {
    const [january] = aggregateMonthly(rows, {
      department: ALL_FILTER,
      propertyType: ALL_FILTER,
    });
    expect(january?.transactions).toBe(500);
    // (10000*100 + 2000*300 + 1000*100) / 500
    expect(january?.medianPricePerSqm).toBeCloseTo(3400, 6);
    expect(january?.totalValue).toBe(3_000_000);
  });

  it('pondère aussi les bornes P10 et P90', () => {
    const [january] = aggregateMonthly(rows, { department: ALL_FILTER, propertyType: ALL_FILTER });
    expect(january?.p10PricePerSqm).toBeCloseTo(3000, 6);
    expect(january?.p90PricePerSqm).toBeCloseTo(8000, 6);
  });

  it('filtre par département et par type de bien', () => {
    const paris = aggregateMonthly(rows, { department: '75', propertyType: ALL_FILTER });
    expect(paris.map((p) => p.medianPricePerSqm)).toEqual([10_000, 9000]);

    const houses = aggregateMonthly(rows, { department: ALL_FILTER, propertyType: 'maison' });
    expect(houses).toHaveLength(1);
    expect(houses[0]?.transactions).toBe(100);
  });

  it('renvoie un tableau vide sans jamais lever', () => {
    expect(aggregateMonthly([], { department: '75', propertyType: 'maison' })).toEqual([]);
    expect(aggregateMonthly(rows, { department: '00', propertyType: ALL_FILTER })).toEqual([]);
  });
});

describe('computeHeadline', () => {
  it('renvoie null sur une série vide', () => {
    expect(computeHeadline([])).toBeNull();
  });

  it('compare les 12 derniers mois aux 12 précédents', () => {
    // 12 mois à 4000 €/m² puis 12 mois à 4400 €/m², volumes doublés.
    const points = series(24, (index) =>
      index < 12
        ? { medianPricePerSqm: 4000, transactions: 100, totalValue: 1_000_000 }
        : { medianPricePerSqm: 4400, transactions: 200, totalValue: 3_000_000 },
    );
    const headline = computeHeadline(points);

    expect(headline?.lastMonth).toBe('2024-12');
    expect(headline?.medianPricePerSqm).toBeCloseTo(4400, 6);
    expect(headline?.priceChange).toBeCloseTo(0.1, 6);
    expect(headline?.transactions).toBe(2400);
    expect(headline?.volumeChange).toBeCloseTo(1, 6);
    expect(headline?.totalValue).toBe(36_000_000);
    expect(headline?.valueChange).toBeCloseTo(2, 6);
    expect(headline?.analysedTransactions).toBe(3600);
  });

  it('produit un indice de tension borné et son libellé', () => {
    const hot = computeHeadline(
      series(24, (index) =>
        index < 12 ? { medianPricePerSqm: 4000, transactions: 100 } : { medianPricePerSqm: 4600, transactions: 160 },
      ),
    );
    const cold = computeHeadline(
      series(24, (index) =>
        index < 12 ? { medianPricePerSqm: 4600, transactions: 160 } : { medianPricePerSqm: 4000, transactions: 100 },
      ),
    );

    expect(hot?.tension).toBeGreaterThan(cold?.tension ?? 10);
    for (const headline of [hot, cold]) {
      expect(headline?.tension).toBeGreaterThanOrEqual(0);
      expect(headline?.tension).toBeLessThanOrEqual(10);
    }
    expect(hot?.tensionLabel).toBe('très tendu');
    expect(cold?.tensionLabel).toBe('détendu');
  });

  it('reste défini quand il n y a pas de période de comparaison', () => {
    const headline = computeHeadline(series(6, () => ({})));
    expect(headline?.transactions).toBe(600);
    expect(Number.isNaN(headline?.priceChange ?? 0)).toBe(true);
    expect(Number.isFinite(headline?.tension ?? Number.NaN)).toBe(true);
  });
});

describe('toBase100', () => {
  it('ramène chaque département à 100 sur son premier mois', () => {
    const rows = toBase100([
      { code: '75', points: series(3, (index) => ({ medianPricePerSqm: 10_000 + index * 1000 })) },
      { code: '59', points: series(3, (index) => ({ medianPricePerSqm: 2000 - index * 100 })) },
    ]);

    expect(rows.map((row) => row.month)).toEqual(['2023-01', '2023-02', '2023-03']);
    expect(rows[0]).toMatchObject({ '75': 100, '59': 100 });
    expect(rows[2]).toMatchObject({ '75': 120, '59': 90 });
  });

  it('ignore un département sans point exploitable', () => {
    const rows = toBase100([
      { code: '75', points: series(2, () => ({})) },
      { code: '59', points: [] },
      { code: '69', points: series(2, () => ({ medianPricePerSqm: Number.NaN })) },
    ]);
    expect(rows[0]).toEqual({ month: '2023-01', '75': 100 });
  });

  it('renvoie un tableau vide sans entrée', () => {
    expect(toBase100([])).toEqual([]);
  });
});

describe('toRegionBase100', () => {
  const departments: readonly Department[] = [
    { code: '75', name: 'Paris', region: 'Île-de-France' },
    { code: '92', name: 'Hauts-de-Seine', region: 'Île-de-France' },
    { code: '59', name: 'Nord', region: 'Hauts-de-France' },
  ];

  const rows: readonly MonthlyStat[] = [
    stat({ month: '2024-01', departmentCode: '75', transactions: 100, medianPricePerSqm: 10_000 }),
    stat({ month: '2024-01', departmentCode: '92', transactions: 300, medianPricePerSqm: 6000 }),
    stat({ month: '2024-01', departmentCode: '59', transactions: 200, medianPricePerSqm: 2000 }),
    stat({ month: '2024-01', departmentCode: '01', transactions: 999, medianPricePerSqm: 1 }),
  ];

  it('agrège par région en pondérant par les transactions', () => {
    const regions = toRegionBase100(rows, departments);
    expect(regions.map((r) => r.name)).toEqual(['Hauts-de-France', 'Île-de-France']);

    const idf = regions.find((r) => r.code === 'Île-de-France');
    expect(idf?.points[0]?.transactions).toBe(400);
    // (10000*100 + 6000*300) / 400
    expect(idf?.points[0]?.medianPricePerSqm).toBeCloseTo(7000, 6);
  });

  it('ignore les départements absents du référentiel', () => {
    const regions = toRegionBase100(rows, departments);
    expect(regions).toHaveLength(2);
    const total = regions.reduce((sum, r) => sum + (r.points[0]?.transactions ?? 0), 0);
    expect(total).toBe(600);
  });

  it('applique le filtre de type de bien', () => {
    const withHouses = [
      ...rows,
      stat({ month: '2024-01', departmentCode: '75', propertyType: 'maison', transactions: 50 }),
    ];
    const houses = toRegionBase100(withHouses, departments, 'maison');
    expect(houses).toHaveLength(1);
    expect(houses[0]?.points[0]?.transactions).toBe(50);
  });

  it('produit des séries directement indexables en base 100', () => {
    const regions = toRegionBase100(
      [
        stat({ month: '2024-01', departmentCode: '75', medianPricePerSqm: 10_000 }),
        stat({ month: '2024-02', departmentCode: '75', medianPricePerSqm: 11_000 }),
      ],
      departments,
    );
    expect(toBase100(regions)[1]).toMatchObject({ month: '2024-02', 'Île-de-France': 110 });
  });

  it('renvoie un tableau vide sans donnée', () => {
    expect(toRegionBase100([], departments)).toEqual([]);
    expect(toRegionBase100(rows, [])).toEqual([]);
  });
});

describe('topMovers', () => {
  const communes: readonly CommuneStat[] = [
    commune({ inseeCode: '1', yoyChange: 0.2 }),
    commune({ inseeCode: '2', yoyChange: 0.1 }),
    commune({ inseeCode: '3', yoyChange: 0 }),
    commune({ inseeCode: '4', yoyChange: -0.1 }),
    commune({ inseeCode: '5', yoyChange: -0.2 }),
    commune({ inseeCode: '6', yoyChange: 0.9, transactions: 12 }),
  ];

  it('classe les hausses et les baisses', () => {
    const { risers, fallers } = topMovers(communes, 2);
    expect(risers.map((c) => c.inseeCode)).toEqual(['1', '2']);
    expect(fallers.map((c) => c.inseeCode)).toEqual(['5', '4']);
  });

  it('écarte les communes sous le seuil de transactions', () => {
    expect(topMovers(communes, 3).risers.map((c) => c.inseeCode)).not.toContain('6');
  });

  it('ne duplique pas une commune quand le gisement est trop petit', () => {
    const short = communes.slice(0, 3);
    const { risers, fallers } = topMovers(short, 5);
    const codes = [...risers, ...fallers].map((c) => c.inseeCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(3);
  });

  it('tolère une demande vide ou une source vide', () => {
    expect(topMovers(communes, 0)).toEqual({ risers: [], fallers: [] });
    expect(topMovers([], 5)).toEqual({ risers: [], fallers: [] });
  });
});

describe('cohérence des types de filtre', () => {
  it('accepte un type de bien du domaine', () => {
    const propertyType: PropertyType = 'maison';
    expect(aggregateMonthly([stat({ month: '2024-01', propertyType })], {
      department: ALL_FILTER,
      propertyType,
    })).toHaveLength(1);
  });
});
