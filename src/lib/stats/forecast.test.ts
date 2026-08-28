import { describe, expect, it } from 'vitest';
import { holtForecast, movingAverage } from './forecast';

const width = (p: { high: number; low: number }) => p.high - p.low;

describe('holtForecast', () => {
  it('prolonge une tendance linéaire parfaite sans erreur', () => {
    const series = Array.from({ length: 24 }, (_, i) => 1000 + 10 * i);
    const result = holtForecast(series, 3);
    expect(result.forecast).toHaveLength(3);
    expect(result.forecast[0]?.value).toBeCloseTo(1240, 0);
    expect(result.forecast[2]?.value).toBeCloseTo(1260, 0);
    expect(result.forecast[0]?.high).toBeCloseTo(result.forecast[0]?.value ?? 0, 3);
  });

  it('élargit l intervalle avec l horizon sur une série bruitée', () => {
    const series = [100, 104, 99, 106, 103, 108, 105, 110, 107, 112, 109, 115];
    const result = holtForecast(series, 6);
    const first = result.forecast[0];
    const last = result.forecast[5];
    expect(first && last && width(last) > width(first)).toBe(true);
    expect(result.trend).toBeGreaterThan(0);
  });

  it('renvoie une prévision vide si la série est trop courte', () => {
    expect(holtForecast([42], 3).forecast).toEqual([]);
  });
});

describe('movingAverage', () => {
  it('lisse avec une fenêtre centrée et respecte les bords', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([1.5, 2, 3, 4, 4.5]);
    expect(movingAverage([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });
});
