-- Durcissement suite aux advisors Supabase
-- 1. RLS sur chaque partition (PostgREST les expose individuellement)
alter table dvf_mutations_2022 enable row level security;
alter table dvf_mutations_2023 enable row level security;
alter table dvf_mutations_2024 enable row level security;
alter table dvf_mutations_2025 enable row level security;
alter table dvf_mutations_2026 enable row level security;

-- 2. search_path figé sur les fonctions security definer
alter function refresh_clean_mutations(date, date) set search_path = public;
alter function refresh_materialized_views() set search_path = public;
alter function increment_run_counters(uuid, integer, integer) set search_path = public;
alter function get_database_health() set search_path = public;

-- 3. Les fonctions d'écriture ne sont exécutables que par service_role
revoke execute on function refresh_clean_mutations(date, date) from public, anon, authenticated;
revoke execute on function refresh_materialized_views() from public, anon, authenticated;
revoke execute on function increment_run_counters(uuid, integer, integer) from public, anon, authenticated;
grant execute on function refresh_clean_mutations(date, date) to service_role;
grant execute on function refresh_materialized_views() to service_role;
grant execute on function increment_run_counters(uuid, integer, integer) to service_role;
-- get_database_health reste public : lecture seule d'indicateurs non sensibles (page monitoring).
