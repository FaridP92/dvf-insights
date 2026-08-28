import { describe, expect, it } from 'vitest';
import { explorerFiltersReducer, INITIAL_EXPLORER_FILTERS, isPristine } from './useExplorerFilters';

describe('explorerFiltersReducer', () => {
  it('ne mute pas l état précédent en changeant un champ', () => {
    const next = explorerFiltersReducer(INITIAL_EXPLORER_FILTERS, {
      type: 'setPropertyType',
      value: 'maison',
    });
    expect(next.propertyType).toBe('maison');
    expect(INITIAL_EXPLORER_FILTERS.propertyType).toBe('tous');
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
