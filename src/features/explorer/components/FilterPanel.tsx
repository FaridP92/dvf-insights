import { type Dispatch } from 'react';
import { RotateCcw } from 'lucide-react';
import { formatInt } from '@/lib/format';
import { Badge, Segmented, Select, cn } from '@/shared/ui';
import { DEPARTMENTS } from '@/shared/mocks/departments';
import {
  isPristine,
  type ExplorerFilters,
  type ExplorerFiltersAction,
  type PeriodFilter,
  type PropertyTypeFilter,
  type RangeField,
  type RoomsFilter,
} from '../hooks/useExplorerFilters';

/**
 * Barre de filtres de l'explorateur.
 *
 * Elle reste purement contrôlée : aucun état local, tout passe par le reducer. C'est ce qui
 * permet de dériver la sélection différée pour les graphiques lourds sans désynchroniser
 * les contrôles de la donnée affichée.
 */

const PROPERTY_TYPE_OPTIONS: ReadonlyArray<{
  readonly value: PropertyTypeFilter;
  readonly label: string;
}> = [
  { value: 'tous', label: 'Tous' },
  { value: 'appartement', label: 'Appartement' },
  { value: 'maison', label: 'Maison' },
];

const ROOMS_OPTIONS: ReadonlyArray<{ readonly value: RoomsFilter; readonly label: string }> = [
  { value: 'toutes', label: 'Toutes' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4+' },
];

const PERIOD_OPTIONS: ReadonlyArray<{ readonly value: PeriodFilter; readonly label: string }> = [
  { value: '12', label: '12 mois' },
  { value: '6', label: '6 mois' },
  { value: '3', label: '3 mois' },
];

/** Intitulé visuel d'un groupe de contrôles. L'étiquette accessible vit sur le contrôle. */
function FieldLabel({ children }: { readonly children: string }) {
  return (
    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
      {children}
    </p>
  );
}

function NumberInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number | null;
  readonly placeholder: string;
  readonly onChange: (value: number | null) => void;
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      aria-label={label}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(event) => {
        const raw = event.target.value.trim();
        const parsed = Number(raw);
        onChange(raw === '' || !Number.isFinite(parsed) ? null : parsed);
      }}
      className="focus-ring w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs tabular text-fg placeholder:text-fg-subtle hover:border-border-strong"
    />
  );
}

interface FilterPanelProps {
  readonly filters: ExplorerFilters;
  readonly dispatch: Dispatch<ExplorerFiltersAction>;
  readonly matched: number;
  readonly total: number;
}

export function FilterPanel({ filters, dispatch, matched, total }: FilterPanelProps) {
  const setRange = (field: RangeField) => (value: number | null) =>
    dispatch({ type: 'setRange', field, value });
  const pristine = isPristine(filters);

  return (
    <section
      aria-label="Filtres de l'explorateur"
      className="card mb-6 flex flex-col gap-4 p-4 md:p-5"
    >
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
            Départements
          </span>
          <span className="text-[11px] text-fg-subtle">
            {filters.departments.length === 0
              ? 'tous'
              : `${formatInt(filters.departments.length)} sélectionné${filters.departments.length > 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Départements">
          {DEPARTMENTS.map((department) => {
            const active = filters.departments.includes(department.code);
            return (
              <button
                key={department.code}
                type="button"
                aria-pressed={active}
                // Le nom est masqué sous le point de rupture `sm` : l'étiquette accessible
                // ne doit pas se réduire au code du département.
                aria-label={department.name}
                title={department.name}
                onClick={() => dispatch({ type: 'toggleDepartment', code: department.code })}
                className={cn(
                  'focus-ring rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg',
                )}
              >
                <span className="tabular">{department.code}</span>
                <span className="ml-1.5 hidden sm:inline">{department.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <FieldLabel>Type de bien</FieldLabel>
          <Segmented
            value={filters.propertyType}
            onChange={(value) => dispatch({ type: 'setPropertyType', value })}
            options={PROPERTY_TYPE_OPTIONS}
            ariaLabel="Type de bien"
          />
        </div>

        <div>
          <FieldLabel>Surface (m²)</FieldLabel>
          <div className="flex items-center gap-2">
            <NumberInput
              id="filter-surface-min"
              label="Surface minimale en m²"
              placeholder="min"
              value={filters.surfaceMin}
              onChange={setRange('surfaceMin')}
            />
            <span className="text-xs text-fg-subtle" aria-hidden>
              ·
            </span>
            <NumberInput
              id="filter-surface-max"
              label="Surface maximale en m²"
              placeholder="max"
              value={filters.surfaceMax}
              onChange={setRange('surfaceMax')}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Prix (€)</FieldLabel>
          <div className="flex items-center gap-2">
            <NumberInput
              id="filter-price-min"
              label="Prix minimal en euros"
              placeholder="min"
              value={filters.priceMin}
              onChange={setRange('priceMin')}
            />
            <span className="text-xs text-fg-subtle" aria-hidden>
              ·
            </span>
            <NumberInput
              id="filter-price-max"
              label="Prix maximal en euros"
              placeholder="max"
              value={filters.priceMax}
              onChange={setRange('priceMax')}
            />
          </div>
        </div>

        <div>
          <FieldLabel>Pièces</FieldLabel>
          <Segmented
            value={filters.rooms}
            onChange={(value) => dispatch({ type: 'setRooms', value })}
            options={ROOMS_OPTIONS}
            ariaLabel="Nombre de pièces"
          />
        </div>

        <div>
          <FieldLabel>Période</FieldLabel>
          <Select
            value={filters.period}
            onChange={(value) => dispatch({ type: 'setPeriod', value })}
            options={PERIOD_OPTIONS}
            ariaLabel="Profondeur d'historique"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <Badge tone={matched === 0 ? 'warn' : 'accent'}>
          <span className="tabular">{formatInt(matched)}</span>
          <span className="font-normal">transactions sur</span>
          <span className="tabular">{formatInt(total)}</span>
        </Badge>
        <button
          type="button"
          onClick={() => dispatch({ type: 'reset' })}
          disabled={pristine}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-fg-muted"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Réinitialiser
        </button>
      </div>
    </section>
  );
}
