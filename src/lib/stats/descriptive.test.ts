import { describe as suite, expect, it } from 'vitest';
import {
  describe,
  histogram,
  mean,
  median,
  medianAbsoluteDeviation,
  quantile,
  relativeChange,
  standardDeviation,
} from './descriptive';

suite('descriptive', () => {
  it('calcule la moyenne et renvoie NaN sur tableau vide', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBeNaN();
  });

  it('calcule la médiane pour un nombre pair et impair de valeurs', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('interpole les quantiles selon la méthode R-7 (compatible numpy)', () => {
    const values = [10, 20, 30, 40, 50];
    expect(quantile(values, 0)).toBe(10);
    expect(quantile(values, 0.25)).toBe(20);
    expect(quantile(values, 0.9)).toBeCloseTo(46, 6);
    expect(quantile(values, 1)).toBe(50);
    expect(quantile(values, 1.7)).toBe(50);
  });

  it('ne mute pas le tableau d entrée', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it('calcule l écart-type échantillon', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(standardDeviation([1])).toBeNaN();
  });

  it('la MAD ignore une valeur extrême là où l écart-type explose', () => {
    const base = [100, 102, 98, 101, 99, 100, 103, 97];
    const withOutlier = [...base, 10_000];
    expect(medianAbsoluteDeviation(withOutlier)).toBeLessThan(5);
    expect(standardDeviation(withOutlier)).toBeGreaterThan(1000);
  });

  it('calcule la variation relative et protège la division par zéro', () => {
    expect(relativeChange(110, 100)).toBeCloseTo(0.1);
    expect(relativeChange(90, 100)).toBeCloseTo(-0.1);
    expect(relativeChange(10, 0)).toBeNaN();
  });

  it('describe renvoie les quantiles ordonnés', () => {
    const d = describe(Array.from({ length: 101 }, (_, i) => i));
    expect(d.min).toBe(0);
    expect(d.p10).toBe(10);
    expect(d.median).toBe(50);
    expect(d.p90).toBe(90);
    expect(d.max).toBe(100);
    expect(d.count).toBe(101);
  });

  it('histogram répartit les valeurs et inclut la borne max dans la dernière classe', () => {
    const bins = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((acc, b) => acc + b.count, 0)).toBe(11);
    expect(bins[4]?.count).toBe(3);
    expect(histogram([], 5)).toEqual([]);
  });
});
