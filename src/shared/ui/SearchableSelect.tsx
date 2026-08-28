import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';
import { Select } from './Select';

/**
 * Liste déroulante avec recherche.
 *
 * En deçà de vingt entrées, une liste native reste le meilleur contrôle : plus rapide au
 * clavier, familière, gratuite en accessibilité. Au delà (97 départements, plusieurs
 * centaines de communes), faire défiler devient absurde et la saisie filtrante prend le
 * relais, sous la forme d'une combobox conforme au motif ARIA.
 */
const SEARCH_THRESHOLD = 20;

interface SearchableSelectProps<T extends string> {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly ariaLabel: string;
  readonly className?: string;
}

/** Comparaison tolérante aux accents et à la casse : "herault" doit trouver "Hérault". */
const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function SearchableSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: SearchableSelectProps<T>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';

  const matches = useMemo(() => {
    const needle = normalize(query.trim());
    return needle === ''
      ? options
      : options.filter((option) => normalize(option.label).includes(needle));
  }, [options, query]);

  if (options.length <= SEARCH_THRESHOLD) {
    return (
      <Select
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={ariaLabel}
        className={className ?? ''}
      />
    );
  }

  const close = (): void => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  };

  const commit = (index: number): void => {
    const option = matches[index];
    if (option === undefined) return;
    onChange(option.value);
    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        if (matches.length === 0) return 0;
        return (current + delta + matches.length) % matches.length;
      });
      return;
    }
    if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      commit(activeIndex);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className={cn('relative inline-flex', className)}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches.length > 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        value={open ? query : selectedLabel}
        placeholder={selectedLabel}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={handleKeyDown}
        className="focus-ring w-full rounded-lg border border-border bg-surface py-1.5 pl-3 pr-8 text-xs font-medium text-fg hover:border-border-strong"
      />
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
        aria-hidden
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full min-w-48 overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-1.5 text-xs text-fg-subtle">Aucun résultat</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                // mousedown plutôt que click : le blur de l'input démonterait la liste avant.
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(index);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'cursor-pointer px-3 py-1.5 text-xs',
                  index === activeIndex ? 'bg-surface-2 text-fg' : 'text-fg-muted',
                  option.value === value && 'font-medium text-accent',
                )}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
