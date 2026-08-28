/**
 * Standard global de gestion des erreurs.
 * Toute couche data (API, Supabase, transformation) renvoie un Result plutôt que de lancer.
 * Les composants ne voient jamais d'exception brute : ils reçoivent un AppError typé.
 */
export type AppErrorKind = 'network' | 'supabase' | 'validation' | 'sync' | 'unknown';

export interface AppError {
  readonly kind: AppErrorKind;
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}

export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function appError(
  kind: AppErrorKind,
  message: string,
  options: { cause?: unknown; retryable?: boolean } = {},
): AppError {
  const base: AppError = { kind, message, retryable: options.retryable ?? kind === 'network' };
  return options.cause === undefined ? base : { ...base, cause: options.cause };
}

/** Convertit une exception inconnue en AppError exploitable par l'UI. */
export function toAppError(cause: unknown, kind: AppErrorKind = 'unknown'): AppError {
  if (isAppError(cause)) return cause;
  const message = cause instanceof Error ? cause.message : 'Erreur inattendue';
  return appError(kind, message, { cause });
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'message' in value &&
    'retryable' in value
  );
}

/** Exécute une promesse et capture toute exception dans un Result. */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  kind: AppErrorKind = 'unknown',
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (cause) {
    return err(toAppError(cause, kind));
  }
}

export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? { ok: true, value: fn(result.value) } : result;
}
