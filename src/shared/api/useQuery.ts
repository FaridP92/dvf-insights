import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppError, Result } from '@/lib/result';

export type QueryState<T> =
  | { readonly status: 'loading'; readonly data: undefined; readonly error: undefined }
  | { readonly status: 'success'; readonly data: T; readonly error: undefined }
  | { readonly status: 'error'; readonly data: undefined; readonly error: AppError };

/**
 * Hook de requête minimal et uniforme : un état discriminé, un refetch, une annulation
 * sur démontage. Volontairement sans cache global pour rester lisible dans une vitrine ;
 * remplaçable par TanStack Query sans toucher aux composants.
 */
export function useQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<Result<T>>,
  deps: readonly unknown[],
): QueryState<T> & { readonly refetch: () => void } {
  const [state, setState] = useState<QueryState<T>>({
    status: 'loading',
    data: undefined,
    error: undefined,
  });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: undefined, error: undefined });
    void fetcherRef.current(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'success', data: result.value, error: undefined }
          : { status: 'error', data: undefined, error: result.error },
      );
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refetch };
}
