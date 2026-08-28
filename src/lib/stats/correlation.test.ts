import { describe, expect, it } from 'vitest';
import { correlationMatrix, pearson } from './correlation';

describe('correlation', () => {
  it('détecte une corrélation parfaite positive et négative', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
  });

  it('renvoie NaN si une variable est constante ou les tailles diffèrent', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNaN();
    expect(pearson([1, 2], [1, 2, 3])).toBeNaN();
  });

  it('construit une matrice symétrique avec une diagonale à 1', () => {
    const cells = correlationMatrix({ a: [1, 2, 3], b: [3, 2, 1], c: [1, 3, 2] });
    expect(cells).toHaveLength(9);
    const get = (r: string, c: string) => cells.find((x) => x.row === r && x.col === c)?.value;
    expect(get('a', 'a')).toBe(1);
    expect(get('a', 'b')).toBeCloseTo(-1);
    expect(get('a', 'c')).toBeCloseTo(get('c', 'a') ?? Number.NaN);
  });
});
