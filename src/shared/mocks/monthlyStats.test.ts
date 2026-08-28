import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, PROPERTY_TYPES } from './departments';
import { MONTHS_COUNT, REFERENCE_MONTH, generateMonthlyStats, listMonths } from './monthlyStats';

const stats = generateMonthlyStats();

describe('generateMonthlyStats', () => {
  it('est déterministe', () => {
    expect(generateMonthlyStats()).toEqual(stats);
  });

  it('couvre 36 mois × 12 départements × 2 types de biens', () => {
    expect(stats).toHaveLength(MONTHS_COUNT * DEPARTMENTS.length * PROPERTY_TYPES.length);
    expect(new Set(stats.map((s) => s.month)).size).toBe(MONTHS_COUNT);
    expect(new Set(stats.map((s) => s.departmentCode)).size).toBe(DEPARTMENTS.length);
    expect(new Set(stats.map((s) => s.propertyType)).size).toBe(PROPERTY_TYPES.length);
  });

  it('se termine au mois de référence 2026-07', () => {
    const months = listMonths();
    expect(months).toHaveLength(MONTHS_COUNT);
    expect(months.at(-1)).toBe(REFERENCE_MONTH);
    expect(months.at(-1)).toBe('2026-07');
    expect(months[0]).toBe('2023-08');
    expect(months).toEqual(months.toSorted());
  });

  it('ne produit aucun doublon (mois, département, type)', () => {
    const keys = stats.map((s) => `${s.month}|${s.departmentCode}|${s.propertyType}`);
    expect(new Set(keys).size).toBe(stats.length);
  });

  it('garde des prix dans des bornes plausibles', () => {
    for (const row of stats) {
      expect(row.medianPricePerSqm).toBeGreaterThan(1200);
      expect(row.medianPricePerSqm).toBeLessThan(14_000);
      expect(row.p10PricePerSqm).toBeLessThan(row.medianPricePerSqm);
      expect(row.p90PricePerSqm).toBeGreaterThan(row.medianPricePerSqm);
      expect(row.transactions).toBeGreaterThan(0);
      expect(row.medianSurface).toBeGreaterThan(40);
      expect(row.medianSurface).toBeLessThan(120);
    }
  });

  it('garde Paris nettement au-dessus du Nord', () => {
    const latest = (code: string): number =>
      stats.find(
        (s) =>
          s.month === REFERENCE_MONTH &&
          s.departmentCode === code &&
          s.propertyType === 'appartement',
      )?.medianPricePerSqm ?? 0;
    expect(latest('75')).toBeGreaterThan(3 * latest('59'));
  });

  it('produit une valeur totale cohérente avec volume, prix et surface', () => {
    for (const row of stats) {
      const expected = row.transactions * row.medianPricePerSqm * row.medianSurface * 1.05;
      expect(Math.abs(row.totalValue - expected) / expected).toBeLessThan(0.01);
    }
  });
});
