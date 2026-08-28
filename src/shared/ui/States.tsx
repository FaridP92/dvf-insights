import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { AppError } from '@/lib/result';
import { cn } from './cn';

export function Skeleton({ className }: { readonly className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

export function ChartSkeleton({ height = 260 }: { readonly height?: number }) {
  return (
    <div className="flex flex-col gap-3" style={{ height }} role="status" aria-label="Chargement">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="flex-1" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="card p-5" role="status" aria-label="Chargement">
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="mt-3 h-7 w-3/4" />
      <Skeleton className="mt-3 h-4 w-1/3" />
    </div>
  );
}

const kindLabels: Record<AppError['kind'], string> = {
  network: 'Problème réseau',
  supabase: 'Erreur de la base de données',
  validation: 'Données inattendues',
  sync: 'Erreur de synchronisation',
  unknown: 'Erreur inattendue',
};

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  readonly error: AppError;
  readonly onRetry?: () => void;
  readonly className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-danger/30 bg-danger-soft p-6 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-5 text-danger" aria-hidden />
      <div>
        <p className="text-sm font-medium text-fg">{kindLabels[error.kind]}</p>
        <p className="mt-1 text-xs text-fg-muted">{error.message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Réessayer
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { readonly message: string }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center text-sm text-fg-subtle">{message}</div>
  );
}
