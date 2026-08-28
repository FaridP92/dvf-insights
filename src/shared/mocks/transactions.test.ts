import { describe, expect, it } from 'vitest';
import { generateTransactions } from './transactions';
import { generateCommuneStats } from './communeStats';
import { REFERENCE_DATE } from './monthlyStats';

const transactions = generateTransactions();

describe('generateTransactions', () => {
  it('est déterministe et respecte le nombre demandé', () => {
    expect(transactions).toHaveLength(2500);
    expect(generateTransactions()).toEqual(transactions);
    expect(generateTransactions(100)).toHaveLength(100);
  });

  it('garde pricePerSqm = price / surface à 1 % près', () => {
    for (const row of transactions) {
      const expected = row.price / row.surface;
      expect(Math.abs(row.pricePerSqm - expected) / expected).toBeLessThan(0.01);
    }
  });

  it('produit des identifiants uniques au format attendu', () => {
    expect(new Set(transactions.map((t) => t.id)).size).toBe(transactions.length);
    for (const row of transactions) {
      expect(row.id).toMatch(/^M20\d{2}-\d{6}$/);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('couvre les douze derniers mois, du plus récent au plus ancien', () => {
    const end = REFERENCE_DATE.toISOString().slice(0, 10);
    const start = new Date(REFERENCE_DATE.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
    for (const row of transactions) {
      expect(row.date <= end).toBe(true);
      expect(row.date >= start).toBe(true);
    }
    const dates = transactions.map((t) => t.date);
    expect(dates).toEqual(dates.toSorted().toReversed());
  });

  it('garde des caractéristiques physiques cohérentes avec le type de bien', () => {
    for (const row of transactions) {
      if (row.propertyType === 'appartement') {
        expect(row.surface).toBeGreaterThanOrEqual(18);
        expect(row.surface).toBeLessThanOrEqual(140);
        expect(row.landSurface).toBe(0);
        expect(row.rooms).toBeGreaterThanOrEqual(1);
        expect(row.rooms).toBeLessThanOrEqual(8);
      } else {
        expect(row.surface).toBeGreaterThanOrEqual(60);
        expect(row.surface).toBeLessThanOrEqual(250);
        expect(row.landSurface).toBeGreaterThanOrEqual(150);
        expect(row.landSurface).toBeLessThanOrEqual(1500);
        expect(row.rooms).toBeGreaterThanOrEqual(2);
        expect(row.rooms).toBeLessThanOrEqual(9);
      }
      // Fenêtre imposée par le nettoyage SQL.
      expect(row.pricePerSqm).toBeGreaterThanOrEqual(200);
      expect(row.pricePerSqm).toBeLessThanOrEqual(30_000);
    }
  });

  it('rattache chaque mutation à une commune connue', () => {
    const known = new Map(
      generateCommuneStats().map((c) => [`${c.inseeCode}|${c.propertyType}`, c]),
    );
    for (const row of transactions) {
      expect(known.has(`${row.inseeCode}|${row.propertyType}`)).toBe(true);
    }
  });

  it('injecte environ 2 % de mutations aberrantes', () => {
    const communes = new Map(
      generateCommuneStats().map((c) => [`${c.inseeCode}|${c.propertyType}`, c.medianPricePerSqm]),
    );
    const outliers = transactions.filter((t) => {
      const reference = communes.get(`${t.inseeCode}|${t.propertyType}`) ?? t.pricePerSqm;
      const ratio = t.pricePerSqm / reference;
      return ratio < 0.6 || ratio > 1.8;
    });
    const share = outliers.length / transactions.length;
    expect(share).toBeGreaterThan(0.005);
    expect(share).toBeLessThan(0.08);
  });
});
