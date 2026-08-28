import type { QueryState } from '@/shared/api/useQuery';

/** État de requête tel que le renvoie useQuery, refetch compris. */
export type Query<T> = QueryState<T> & { readonly refetch: () => void };
