import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatPct } from '@/lib/format';
import { cn } from './cn';

interface TrendProps {
  readonly value: number; // fraction
  /** true si une hausse est une bonne nouvelle (prix vu par un vendeur, volume). */
  readonly positiveIsGood?: boolean;
  readonly className?: string;
  readonly label?: string;
}

export function Trend({ value, positiveIsGood = true, className, label = 'vs N-1' }: TrendProps) {
  if (!Number.isFinite(value)) {
    return <span className={cn('text-xs text-fg-subtle', className)}>n/d</span>;
  }
  const flat = Math.abs(value) < 0.0005;
  const good = flat ? null : value > 0 === positiveIsGood;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular',
        good === null && 'bg-surface-2 text-fg-muted',
        good === true && 'bg-accent-soft text-accent',
        good === false && 'bg-danger-soft text-danger',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {formatPct(value)}
      {label && <span className="font-normal text-fg-subtle">{label}</span>}
    </span>
  );
}
