import { describe, expect, it } from 'vitest';
import { detectAnomalies } from './anomalies';

interface Sale {
  readonly commune: string;
  readonly ppsqm: number;
}

const group = (commune: string, base: number): Sale[] =>
  [0.95, 0.98, 1, 1.02, 1.03, 0.97, 1.01, 0.99, 1.04, 0.96].map((k) => ({ commune, ppsqm: base * k }));

describe('detectAnomalies', () => {
  it('détecte une sous-évaluation dans son groupe sans confondre deux marchés de niveaux différents', () => {
    const paris = group('Paris', 10_000);
    const lille = [...group('Lille', 2500), { commune: 'Lille', ppsqm: 900 }];
    const anomalies = detectAnomalies([...paris, ...lille], {
      value: (s) => s.ppsqm,
      groupBy: (s) => s.commune,
    });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.item.ppsqm).toBe(900);
    expect(anomalies[0]?.direction).toBe('under');
  });

  it('ignore les groupes trop petits et trie par score décroissant', () => {
    const small = [{ commune: 'X', ppsqm: 1 }, { commune: 'X', ppsqm: 100 }];
    const big = [...group('Y', 3000), { commune: 'Y', ppsqm: 9000 }, { commune: 'Y', ppsqm: 6000 }];
    const anomalies = detectAnomalies([...small, ...big], {
      value: (s) => s.ppsqm,
      groupBy: (s) => s.commune,
    });
    expect(anomalies.every((a) => a.item.commune === 'Y')).toBe(true);
    expect(anomalies[0]?.item.ppsqm).toBe(9000);
    expect(anomalies[0]?.direction).toBe('over');
  });

  it('ne signale rien quand la dispersion est nulle', () => {
    const flat = Array.from({ length: 10 }, () => ({ commune: 'Z', ppsqm: 3000 }));
    expect(detectAnomalies(flat, { value: (s) => s.ppsqm, groupBy: (s) => s.commune })).toEqual([]);
  });
});
