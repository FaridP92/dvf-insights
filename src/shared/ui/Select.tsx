import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

interface SelectProps<T extends string> {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly ariaLabel: string;
  readonly className?: string;
}

export function Select<T extends string>({ value, onChange, options, ariaLabel, className }: SelectProps<T>) {
  return (
    <div className={cn('relative inline-flex', className)}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="focus-ring appearance-none rounded-lg border border-border bg-surface py-1.5 pl-3 pr-8 text-xs font-medium text-fg hover:border-border-strong"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
}
