import { describe, expect, it } from 'vitest';
import {
  formatElasticity,
  formatPlusMinus,
  formatScore,
  formatShortDate,
  formatTrendPerMonth,
} from './display';

/** L'espace insécable étroit inséré par Intl fausse les comparaisons littérales. */
const normalize = (value: string): string => value.replaceAll(/\s/gu, ' ');

describe('formatPlusMinus', () => {
  it('rend une incertitude symétrique en pourcentage', () => {
    expect(normalize(formatPlusMinus(0.0324))).toBe('± 3,2 %');
    expect(normalize(formatPlusMinus(-0.05))).toBe('± 5,0 %');
  });

  it('signale une valeur indisponible', () => {
    expect(formatPlusMinus(Number.NaN)).toBe('n/d');
  });
});

describe('formatTrendPerMonth', () => {
  it('force le signe et l unité', () => {
    expect(normalize(formatTrendPerMonth(12.44))).toBe('+12,4 €/m²/mois');
    expect(normalize(formatTrendPerMonth(-3))).toBe('-3,0 €/m²/mois');
    expect(formatTrendPerMonth(Number.NaN)).toBe('n/d');
  });
});

describe('formatScore et formatElasticity', () => {
  it('gardent une décimale pour le score et deux pour l élasticité', () => {
    expect(formatScore(-4.72)).toBe('-4,7');
    expect(formatElasticity(0.8812)).toBe('0,88');
    expect(formatScore(Number.NaN)).toBe('n/d');
    expect(formatElasticity(Number.NaN)).toBe('n/d');
  });
});

describe('formatShortDate', () => {
  it('affiche une date de mutation sans heure', () => {
    expect(normalize(formatShortDate('2026-03-12'))).toContain('mars');
    expect(formatShortDate('pas-une-date')).toBe('pas-une-date');
  });
});
