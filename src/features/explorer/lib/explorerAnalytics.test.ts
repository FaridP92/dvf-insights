import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/shared/types/dvf';
import { INITIAL_EXPLORER_FILTERS, type ExplorerFilters } from '../hooks/useExplorerFilters';
import {
  applyFilters,
  communeRanking,
  correlations,
  priceDistribution,
  structureBySurfaceBand,
  surfacePriceScatter,
  SURFACE_BAND_LABELS,
} from './explorerAnalytics';

const NOW = new Date('2026-01-15T12:00:00.000Z');

function tx(overrides: Partial<Transaction> & { readonly id: string }): Transaction {
  const base: Transaction = {
    id: overrides.id,
    date: '2026-01-10',
    inseeCode: '75111',
    communeName: 'Paris 11e',
    departmentCode: '75',
    propertyType: 'appartement',
    price: 500_000,
    surface: 50,
    rooms: 2,
    landSurface: 0,
    pricePerSqm: 10_000,
  };
  return { ...base, ...overrides };
}

const filters = (patch: Partial<ExplorerFilters> = {}): ExplorerFilters => ({
  ...INITIAL_EXPLORER_FILTERS,
  ...patch,
});

describe('applyFilters', () => {
  const sample: readonly Transaction[] = [
    tx({
      id: 'a',
      date: '2026-01-10',
      departmentCode: '75',
      surface: 40,
      price: 400_000,
      rooms: 2,
    }),
    tx({
      id: 'b',
      date: '2025-11-01',
      departmentCode: '69',
      propertyType: 'maison',
      surface: 120,
      price: 300_000,
      rooms: 5,
      landSurface: 400,
    }),
    tx({
      id: 'c',
      date: '2025-03-01',
      departmentCode: '75',
      surface: 90,
      price: 900_000,
      rooms: 4,
    }),
  ];

  it('ne retient rien de plus ancien que la période demandée', () => {
    expect(applyFilters(sample, filters({ period: '3' }), NOW).map((t) => t.id)).toEqual([
      'a',
      'b',
    ]);
    expect(applyFilters(sample, filters({ period: '12' }), NOW).map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('traite une liste de départements vide comme "tous"', () => {
    expect(applyFilters(sample, filters(), NOW)).toHaveLength(3);
    expect(applyFilters(sample, filters({ departments: ['75'] }), NOW).map((t) => t.id)).toEqual([
      'a',
      'c',
    ]);
    expect(applyFilters(sample, filters({ departments: ['75', '69'] }), NOW)).toHaveLength(3);
  });

  it('filtre par type de bien', () => {
    expect(applyFilters(sample, filters({ propertyType: 'maison' }), NOW).map((t) => t.id)).toEqual(
      ['b'],
    );
  });

  it('applique les bornes de surface et de prix, bornes incluses', () => {
    expect(
      applyFilters(sample, filters({ surfaceMin: 40, surfaceMax: 90 }), NOW).map((t) => t.id),
    ).toEqual(['a', 'c']);
    expect(applyFilters(sample, filters({ priceMin: 400_000 }), NOW).map((t) => t.id)).toEqual([
      'a',
      'c',
    ]);
    expect(applyFilters(sample, filters({ priceMax: 350_000 }), NOW).map((t) => t.id)).toEqual([
      'b',
    ]);
  });

  it('traite le filtre 4 pièces comme "4 et plus"', () => {
    expect(applyFilters(sample, filters({ rooms: '2' }), NOW).map((t) => t.id)).toEqual(['a']);
    expect(applyFilters(sample, filters({ rooms: '4' }), NOW).map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('ne renvoie rien plutôt que de planter sur une sélection impossible', () => {
    expect(applyFilters(sample, filters({ surfaceMin: 500 }), NOW)).toEqual([]);
    expect(applyFilters([], filters(), NOW)).toEqual([]);
  });
});

describe('priceDistribution', () => {
  const sample = Array.from({ length: 100 }, (_, i) =>
    tx({ id: `p${i}`, pricePerSqm: 1000 + i * 100 }),
  );

  it('produit le nombre de classes demandé, contiguës et croissantes', () => {
    const { bins } = priceDistribution(sample, 10);
    expect(bins).toHaveLength(10);
    for (let i = 1; i < bins.length; i += 1) {
      expect(bins[i]?.x0).toBeCloseTo(bins[i - 1]?.x1 ?? 0, 6);
    }
    expect(bins[0]?.label).toBe(bins[0]?.x0);
  });

  it('somme les parts à 1 et calcule les statistiques sur toute la sélection', () => {
    const { bins, stats } = priceDistribution(sample, 10);
    const share = bins.reduce((sum, b) => sum + b.share, 0);
    expect(share).toBeCloseTo(1, 6);
    expect(stats.count).toBe(100);
    expect(stats.median).toBeCloseTo(5950, 6);
  });

  it('renvoie une distribution vide sans planter', () => {
    const empty = priceDistribution([], 10);
    expect(empty.bins).toEqual([]);
    expect(empty.stats.count).toBe(0);
  });
});

describe('surfacePriceScatter', () => {
  // Prix construit exactement selon prix = 8000 × surface^0,9 : la régression doit le retrouver.
  const sample = Array.from({ length: 200 }, (_, i) => {
    const surface = 20 + i;
    return tx({ id: `s${i}`, surface, price: 8000 * surface ** 0.9 });
  });

  it('échantillonne un point sur k, de façon déterministe', () => {
    const result = surfacePriceScatter(sample, 50);
    expect(result.points).toHaveLength(50);
    expect(result.sampled).toBe(200);
    expect(result.points[0]?.id).toBe('s0');
    expect(result.points[1]?.id).toBe('s4');
    expect(surfacePriceScatter(sample, 50).points).toEqual(result.points);
  });

  it('ne réduit pas le nuage quand il tient sous le plafond', () => {
    expect(surfacePriceScatter(sample, 800).points).toHaveLength(200);
  });

  it('retrouve élasticité et ordonnée à l origine, et trace la droite en espace linéaire', () => {
    const { fit, line } = surfacePriceScatter(sample, 800);
    expect(fit.slope).toBeCloseTo(0.9, 6);
    expect(Math.exp(fit.intercept)).toBeCloseTo(8000, 3);
    expect(fit.r2).toBeCloseTo(1, 6);
    expect(line).toHaveLength(2);
    expect(line[0]?.surface).toBe(20);
    expect(line[0]?.price).toBeCloseTo(8000 * 20 ** 0.9, 3);
    expect(line[1]?.surface).toBe(219);
    expect(line[1]?.price).toBeCloseTo(8000 * 219 ** 0.9, 3);
  });

  it('renvoie un nuage vide et aucune droite sur une sélection vide', () => {
    const result = surfacePriceScatter([], 800);
    expect(result.points).toEqual([]);
    expect(result.line).toEqual([]);
  });
});

describe('correlations', () => {
  const sample = Array.from({ length: 40 }, (_, i) =>
    tx({
      id: `c${i}`,
      surface: 30 + i,
      price: (30 + i) * 5000,
      rooms: 1 + (i % 5),
      landSurface: i * 10,
      pricePerSqm: 5000,
    }),
  );

  it('renvoie une matrice 5×5 avec une diagonale à 1', () => {
    const cells = correlations(sample);
    expect(cells).toHaveLength(25);
    for (const cell of cells.filter((c) => c.row === c.col)) {
      expect(cell.value).toBe(1);
    }
  });

  it('est symétrique et capte la relation prix / surface', () => {
    const cells = correlations(sample);
    const find = (row: string, col: string): number =>
      cells.find((c) => c.row === row && c.col === col)?.value ?? Number.NaN;
    expect(find('Prix', 'Surface')).toBeCloseTo(find('Surface', 'Prix'), 12);
    expect(find('Prix', 'Surface')).toBeCloseTo(1, 6);
  });

  it('renvoie des NaN plutôt que de planter sur une sélection vide', () => {
    const cells = correlations([]);
    expect(cells).toHaveLength(25);
    expect(Number.isNaN(findCell(cells, 'Prix', 'Surface'))).toBe(true);
  });
});

function findCell(
  cells: ReadonlyArray<{ readonly row: string; readonly col: string; readonly value: number }>,
  row: string,
  col: string,
): number {
  return cells.find((c) => c.row === row && c.col === col)?.value ?? Number.NaN;
}

describe('structureBySurfaceBand', () => {
  it('range chaque mutation dans une seule tranche, bornes hautes exclues', () => {
    const rows = structureBySurfaceBand([
      tx({ id: 'a', surface: 29 }),
      tx({ id: 'b', surface: 30 }),
      tx({ id: 'c', surface: 50, propertyType: 'maison' }),
      tx({ id: 'd', surface: 149.9 }),
      tx({ id: 'e', surface: 150, propertyType: 'maison' }),
      tx({ id: 'f', surface: 400, propertyType: 'maison' }),
    ]);
    expect(rows.map((r) => r.band)).toEqual(SURFACE_BAND_LABELS);
    expect(rows.map((r) => r.total)).toEqual([1, 1, 1, 0, 1, 2]);
    expect(rows[2]).toMatchObject({ appartement: 0, maison: 1 });
    expect(rows.reduce((sum, r) => sum + r.total, 0)).toBe(6);
  });

  it('renvoie toutes les tranches à zéro sur une sélection vide', () => {
    const rows = structureBySurfaceBand([]);
    expect(rows).toHaveLength(SURFACE_BAND_LABELS.length);
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });
});

describe('communeRanking', () => {
  const sample = [
    ...Array.from({ length: 5 }, (_, i) =>
      tx({ id: `x${i}`, inseeCode: '75111', pricePerSqm: 8000 + i * 1000, surface: 40 + i * 10 }),
    ),
    ...Array.from({ length: 2 }, (_, i) =>
      tx({
        id: `y${i}`,
        inseeCode: '69383',
        communeName: 'Lyon 3e',
        departmentCode: '69',
        pricePerSqm: 5000 + i * 200,
        surface: 60,
      }),
    ),
  ];

  it('agrège par commune, trie par volume décroissant et nomme le département', () => {
    const rows = communeRanking(sample);
    expect(rows.map((r) => r.inseeCode)).toEqual(['75111', '69383']);
    expect(rows[0]).toMatchObject({
      transactions: 5,
      departmentName: 'Paris',
      medianPricePerSqm: 10_000,
      p25PricePerSqm: 9000,
      p75PricePerSqm: 11_000,
      medianSurface: 60,
    });
    expect(rows[1]?.departmentName).toBe('Rhône');
  });

  it('respecte la limite demandée', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      tx({ id: `m${i}`, inseeCode: `9${i}`, communeName: `C${i}` }),
    );
    expect(communeRanking(many)).toHaveLength(15);
    expect(communeRanking(many, 4)).toHaveLength(4);
  });

  it('renvoie une liste vide sur une sélection vide', () => {
    expect(communeRanking([])).toEqual([]);
  });
});
