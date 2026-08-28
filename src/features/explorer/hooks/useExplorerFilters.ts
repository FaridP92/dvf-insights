import { useReducer, type Dispatch } from 'react';
import type { PropertyType } from '@/shared/types/dvf';

/**
 * État de filtrage de l'explorateur.
 *
 * Volontairement sérialisable et plat : chaque champ correspond à un contrôle unique
 * du panneau, ce qui rend l'état lisible dans les devtools et facile à mémoïser.
 * Les bornes numériques valent `null` quand l'utilisateur n'a rien saisi, jamais NaN :
 * un champ vide n'est pas une contrainte à zéro.
 */
export type PropertyTypeFilter = 'tous' | PropertyType;

/** Filtre de pièces : "4" signifie 4 pièces ou plus. */
export type RoomsFilter = 'toutes' | '1' | '2' | '3' | '4';

/** Profondeur d'historique en mois, exprimée en chaîne pour alimenter un Select. */
export type PeriodFilter = '12' | '6' | '3';

export interface ExplorerFilters {
  /** Codes de département retenus. Liste vide = tous les départements. */
  readonly departments: readonly string[];
  readonly propertyType: PropertyTypeFilter;
  readonly surfaceMin: number | null;
  readonly surfaceMax: number | null;
  readonly priceMin: number | null;
  readonly priceMax: number | null;
  readonly rooms: RoomsFilter;
  readonly period: PeriodFilter;
}

/** Champ de borne numérique modifiable par les inputs min/max. */
export type RangeField = 'surfaceMin' | 'surfaceMax' | 'priceMin' | 'priceMax';

export type ExplorerFiltersAction =
  | { readonly type: 'toggleDepartment'; readonly code: string }
  | { readonly type: 'setPropertyType'; readonly value: PropertyTypeFilter }
  | { readonly type: 'setRange'; readonly field: RangeField; readonly value: number | null }
  | { readonly type: 'setRooms'; readonly value: RoomsFilter }
  | { readonly type: 'setPeriod'; readonly value: PeriodFilter }
  | { readonly type: 'reset' };

export const INITIAL_EXPLORER_FILTERS: ExplorerFilters = {
  departments: [],
  propertyType: 'tous',
  surfaceMin: null,
  surfaceMax: null,
  priceMin: null,
  priceMax: null,
  rooms: 'toutes',
  period: '12',
};

export function explorerFiltersReducer(
  state: ExplorerFilters,
  action: ExplorerFiltersAction,
): ExplorerFilters {
  switch (action.type) {
    case 'toggleDepartment': {
      const departments = state.departments.includes(action.code)
        ? state.departments.filter((code) => code !== action.code)
        : [...state.departments, action.code];
      return { ...state, departments };
    }
    case 'setPropertyType':
      return { ...state, propertyType: action.value };
    case 'setRange':
      return { ...state, [action.field]: action.value };
    case 'setRooms':
      return { ...state, rooms: action.value };
    case 'setPeriod':
      return { ...state, period: action.value };
    case 'reset':
      return INITIAL_EXPLORER_FILTERS;
  }
}

/** Vrai si aucun filtre n'écarte de mutation (hors période, toujours active). */
export function isPristine(filters: ExplorerFilters): boolean {
  return (
    filters.departments.length === 0 &&
    filters.propertyType === 'tous' &&
    filters.rooms === 'toutes' &&
    filters.period === INITIAL_EXPLORER_FILTERS.period &&
    filters.surfaceMin === null &&
    filters.surfaceMax === null &&
    filters.priceMin === null &&
    filters.priceMax === null
  );
}

export function useExplorerFilters(): readonly [ExplorerFilters, Dispatch<ExplorerFiltersAction>] {
  const [filters, dispatch] = useReducer(explorerFiltersReducer, INITIAL_EXPLORER_FILTERS);
  return [filters, dispatch];
}
