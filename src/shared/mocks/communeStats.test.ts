import { describe, expect, it } from 'vitest';
import { DEPARTMENTS } from './departments';
import { COMMUNES, generateCommuneStats } from './communeStats';

const communeStats = generateCommuneStats();

describe('generateCommuneStats', () => {
  it('est déterministe', () => {
    expect(generateCommuneStats()).toEqual(communeStats);
  });

  it('couvre 6 à 10 communes par département, chacune dans les deux types de biens', () => {
    for (const department of DEPARTMENTS) {
      const communes = COMMUNES[department.code] ?? [];
      expect(communes.length).toBeGreaterThanOrEqual(6);
      expect(communes.length).toBeLessThanOrEqual(10);
      const rows = communeStats.filter((c) => c.departmentCode === department.code);
      expect(rows).toHaveLength(communes.length * 2);
    }
  });

  it('utilise des codes INSEE et des coordonnées cohérents avec le territoire', () => {
    for (const row of communeStats) {
      expect(row.inseeCode).toMatch(/^\d{5}$/);
      expect(row.communeName.length).toBeGreaterThan(2);
      // Emprise métropolitaine.
      expect(row.lat).toBeGreaterThan(41);
      expect(row.lat).toBeLessThan(51.5);
      expect(row.lng).toBeGreaterThan(-5.5);
      expect(row.lng).toBeLessThan(9);
    }
  });

  it('respecte les bornes de variation annuelle et de tension', () => {
    for (const row of communeStats) {
      expect(row.yoyChange).toBeGreaterThanOrEqual(-0.08);
      expect(row.yoyChange).toBeLessThanOrEqual(0.09);
      expect(row.tensionIndex).toBeGreaterThanOrEqual(0);
      expect(row.tensionIndex).toBeLessThanOrEqual(10);
      expect(row.transactions).toBeGreaterThanOrEqual(10);
      expect(row.medianPricePerSqm).toBeGreaterThan(800);
      expect(row.medianPricePerSqm).toBeLessThan(22_000);
    }
  });

  it('reste dans un facteur 0,6 à 1,7 du niveau départemental', () => {
    for (const row of communeStats) {
      const department = DEPARTMENTS.find((d) => d.code === row.departmentCode);
      expect(department).toBeDefined();
      if (!department) continue;
      const ratio = row.medianPricePerSqm / department.basePricePerSqm[row.propertyType];
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(1.75);
    }
  });
});
