import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatEurPerSqm, formatMonth, formatPct } from './format';

describe('format', () => {
  it('formate un prix au m² en français', () => {
    expect(formatEurPerSqm(9876.4).replace(/ | /g, ' ')).toBe('9 876 €/m²');
  });
  it('formate un pourcentage signé', () => {
    expect(formatPct(0.042)).toMatch(/^\+4,2\s?%$/);
    expect(formatPct(-0.1)).toMatch(/^-10\s?%$/);
  });
  it('formate un mois ISO', () => {
    expect(formatMonth('2026-03')).toMatch(/mars 26/);
    expect(formatMonth('bad')).toBe('bad');
  });
  it('formate durée et octets', () => {
    expect(formatDuration(850)).toBe('850 ms');
    expect(formatDuration(12_400)).toBe('12.4 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
    expect(formatBytes(1536)).toBe('1.5 Ko');
  });
});
