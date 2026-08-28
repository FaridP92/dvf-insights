import { useMemo } from 'react';
import type { Department } from '@/shared/types/dvf';
import { fetchDepartments } from './repository';
import { useQuery, type QueryState } from './useQuery';

/**
 * Référentiel des départements, chargé depuis la source active.
 *
 * Le périmètre n'est plus une constante du front : il vient de la table `departments`
 * (97 lignes en live, les 12 profils de démonstration en mock). Toutes les listes
 * déroulantes de département dérivent de ce hook, ce qui garantit qu'elles proposent
 * exactement ce que la base contient.
 */
export interface DepartmentOption {
  readonly value: string;
  readonly label: string;
}

export interface DepartmentsResult {
  readonly departments: readonly Department[];
  /** Options prêtes pour un Select, au format "75 · Paris". */
  readonly options: readonly DepartmentOption[];
  /** Code de département vers nom, pour étiqueter graphiques et tableaux. */
  readonly names: ReadonlyMap<string, string>;
  readonly status: QueryState<readonly Department[]>['status'];
}

/** Référence stable : évite de recalculer les mémos pendant le chargement. */
const NO_DEPARTMENTS: readonly Department[] = [];

export const departmentLabel = (department: Department): string =>
  `${department.code} · ${department.name}`;

export function useDepartments(): DepartmentsResult {
  const query = useQuery(fetchDepartments, []);
  const departments = query.data ?? NO_DEPARTMENTS;

  const options = useMemo(
    () =>
      departments.map(
        (department): DepartmentOption => ({
          value: department.code,
          label: departmentLabel(department),
        }),
      ),
    [departments],
  );

  const names = useMemo(
    () => new Map(departments.map((department) => [department.code, department.name])),
    [departments],
  );

  return { departments, options, names, status: query.status };
}
