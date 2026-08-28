import { describe, expect, it } from 'vitest';
import { tensionIndex, tensionLabel } from './tension';

describe('tensionIndex', () => {
  it('vaut 5 sur un marché neutre', () => {
    expect(tensionIndex({ volumeChange: 0, priceChange: 0, turnoverRate: 0.02 })).toBe(5);
  });

  it('augmente avec le volume, le prix et la rotation, et reste borné', () => {
    const hot = tensionIndex({ volumeChange: 0.2, priceChange: 0.1, turnoverRate: 0.04 });
    const cold = tensionIndex({ volumeChange: -0.2, priceChange: -0.1, turnoverRate: 0.005 });
    expect(hot).toBeGreaterThan(8);
    expect(cold).toBeLessThan(2);
    expect(hot).toBeLessThanOrEqual(10);
    expect(cold).toBeGreaterThanOrEqual(0);
  });

  it('étiquette les niveaux', () => {
    expect(tensionLabel(2)).toBe('détendu');
    expect(tensionLabel(5)).toBe('équilibré');
    expect(tensionLabel(6.5)).toBe('tendu');
    expect(tensionLabel(9)).toBe('très tendu');
  });
});
