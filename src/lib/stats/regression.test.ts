import { describe, expect, it } from 'vitest';
import { estimatePrice, linearRegression, priceSurfaceElasticity } from './regression';

describe('regression', () => {
  it('retrouve la pente et l ordonnée d une droite exacte', () => {
    const fit = linearRegression([1, 2, 3, 4], [3, 5, 7, 9]);
    expect(fit.slope).toBeCloseTo(2);
    expect(fit.intercept).toBeCloseTo(1);
    expect(fit.r2).toBeCloseTo(1);
  });

  it('renvoie NaN quand x est constant ou trop court', () => {
    expect(linearRegression([2, 2, 2], [1, 2, 3]).slope).toBeNaN();
    expect(linearRegression([1], [1]).slope).toBeNaN();
  });

  it('estime une élasticité inférieure à 1 quand le prix/m² décroît avec la surface', () => {
    const points = [20, 40, 60, 80, 120, 160].map((surface) => ({
      surface,
      price: 5000 * surface ** 0.85,
    }));
    const fit = priceSurfaceElasticity(points);
    expect(fit.slope).toBeCloseTo(0.85, 3);
    expect(fit.r2).toBeCloseTo(1, 3);
  });

  it('ignore les points invalides dans le calcul d élasticité', () => {
    const fit = priceSurfaceElasticity([
      { surface: 0, price: 100 },
      { surface: 50, price: 250_000 },
      { surface: 100, price: 450_000 },
    ]);
    expect(fit.n).toBe(2);
  });

  it('estime un prix cohérent avec la médiane locale et un intervalle ordonné', () => {
    const estimate = estimatePrice({
      surface: 55,
      rooms: 2,
      medianPricePerSqm: 5000,
      medianSurface: 55,
      elasticity: 0.88,
      dispersion: 0.4,
    });
    expect(estimate.value).toBeCloseTo(275_000 * (1 + (2 - 55 / 25) * 0.02), 0);
    expect(estimate.low).toBeLessThan(estimate.value);
    expect(estimate.high).toBeGreaterThan(estimate.value);
  });

  it('applique une décote aux grandes surfaces quand l élasticité est inférieure à 1', () => {
    const base = { rooms: 3, medianPricePerSqm: 5000, medianSurface: 60, elasticity: 0.85, dispersion: 0.3 };
    const small = estimatePrice({ ...base, surface: 60 });
    const large = estimatePrice({ ...base, surface: 120 });
    expect(large.value / 120).toBeLessThan(small.value / 60);
  });

  it('renvoie NaN sur entrée invalide', () => {
    expect(
      estimatePrice({ surface: 0, rooms: 1, medianPricePerSqm: 5000, medianSurface: 50, elasticity: 1, dispersion: 0.3 }).value,
    ).toBeNaN();
  });
});
