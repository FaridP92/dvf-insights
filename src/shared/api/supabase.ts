import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

/**
 * Source de données effective.
 * Sans variables d'environnement, l'application tourne sur les mocks typés :
 * même forme de données, aucune dépendance réseau, démo toujours fonctionnelle.
 */
export const dataSource: 'supabase' | 'mock' = url && anonKey ? 'supabase' : 'mock';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (dataSource !== 'supabase' || !url || !anonKey) return null;
  client ??= createClient(url, anonKey, { auth: { persistSession: false } });
  return client;
}
