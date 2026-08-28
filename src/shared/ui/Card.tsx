import type { ReactNode } from 'react';
import { cn } from './cn';

interface CardProps {
  readonly title?: string;
  readonly subtitle?: string;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
  readonly padded?: boolean;
}

export function Card({ title, subtitle, action, className, children, padded = true }: CardProps) {
  return (
    <section className={cn('card flex flex-col', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-fg">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', padded && 'p-5')}>{children}</div>
    </section>
  );
}
