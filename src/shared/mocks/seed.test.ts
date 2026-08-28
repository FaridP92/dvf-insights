import { describe, expect, it } from 'vitest';
import { clamp, createRng, round } from './seed';

describe('createRng', () => {
  it('produit exactement la même séquence pour une même graine', () => {
    const a = createRng(42);
    const b = createRng(42);
    const left = Array.from({ length: 200 }, () => a.next());
    const right = Array.from({ length: 200 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('produit des séquences différentes pour des graines différentes', () => {
    const a = createRng(42);
    const b = createRng(43);
    expect(a.next()).not.toBe(b.next());
  });

  it('reste dans [0, 1) sur next()', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('respecte les bornes de range() et int()', () => {
    const rng = createRng(1234);
    for (let i = 0; i < 500; i += 1) {
      const f = rng.range(-3, 8);
      expect(f).toBeGreaterThanOrEqual(-3);
      expect(f).toBeLessThan(8);
      const n = rng.int(2, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('génère une loi normale de moyenne et d écart-type attendus', () => {
    const rng = createRng(99);
    const sample = Array.from({ length: 20_000 }, () => rng.normal(10, 2));
    const mean = sample.reduce((acc, v) => acc + v, 0) / sample.length;
    const variance = sample.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (sample.length - 1);
    expect(mean).toBeCloseTo(10, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(2, 1);
  });

  it('pick() renvoie un élément du tableau et refuse un tableau vide', () => {
    const rng = createRng(5);
    const values = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i += 1) {
      expect(values).toContain(rng.pick(values));
    }
    expect(() => rng.pick([])).toThrow();
  });
});

describe('utilitaires', () => {
  it('clamp borne des deux côtés', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('round arrondit au nombre de décimales demandé', () => {
    expect(round(1234.567)).toBe(1235);
    expect(round(1234.567, 2)).toBe(1234.57);
  });
});
