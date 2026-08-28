import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Trend } from './Trend';
import { cn } from './cn';

interface KpiCardProps {
  readonly label: string;
  readonly value: string;
  readonly change?: number;
  readonly positiveIsGood?: boolean;
  readonly hint?: string;
  readonly icon?: LucideIcon;
  readonly sparkline?: ReactNode;
  readonly className?: string;
}

export function KpiCard({
  label,
  value,
  change,
  positiveIsGood = true,
  hint,
  icon: Icon,
  sparkline,
  className,
}: KpiCardProps) {
  return (
    <div className={cn('card relative overflow-hidden p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
        {Icon && <Icon className="size-4 text-fg-subtle" aria-hidden />}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular text-fg">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {change !== undefined && <Trend value={change} positiveIsGood={positiveIsGood} />}
        {hint && <span className="truncate text-xs text-fg-subtle">{hint}</span>}
      </div>
      {sparkline && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 opacity-70">{sparkline}</div>}
    </div>
  );
}
