import { describe, expect, it } from 'vitest';
import { explorerFiltersReducer, INITIAL_EXPLORER_FILTERS, isPristine } from './useExplorerFilters';

describe('explorerFiltersReducer', () => {
  it('ajoute puis retire un département sans muter l état précédent', () => {
    const added = explorerFiltersReducer(INITIAL_EXPLORER_FILTERS, {
      type: 'toggleDepartment',
      code: '75',
    });
    expect(added.departments).toEqual(['75']);
    expect(INITIAL_EXPLORER_FILTERS.departments).toEqual([]);

    const both = explorerFiltersReducer(added, { type: 'toggleDepartment', code: '69' });
    expect(both.departments).toEqual(['75', '69']);

    const removed = explorerFiltersReducer(both, { type: 'toggleDepartment', code: '75' });
    expect(removed.departments).toEqual(['69']);
  });

  it('met à jour une borne numérique et accepte null pour la relâcher', () => {
    const withMin = explorerFiltersReducer(INITIAL_EXPLORER_FILTERS, {
      type: 'setRange',
      field: 'surfaceMin',
      value: 40,
    });
    expect(withMin.surfaceMin).toBe(40);
    expect(withMin.surfaceMax).toBeNull();
    expect(
      explorerFiltersReducer(withMin, { type: 'setRange', field: 'surfaceMin', value: null })
        .surfaceMin,
    ).toBeNull();
  });

  it('revient à l état initial et le détecte', () => {
    const dirty = explorerFiltersReducer(
      explorerFiltersReducer(INITIAL_EXPLORER_FILTERS, { type: 'setRooms', value: '3' }),
      { type: 'setPeriod', value: '3' },
    );
    expect(isPristine(dirty)).toBe(false);
    const reset = explorerFiltersReducer(dirty, { type: 'reset' });
    expect(reset).toEqual(INITIAL_EXPLORER_FILTERS);
    expect(isPristine(reset)).toBe(true);
  });
});
