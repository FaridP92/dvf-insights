-- Fonctions appelées par les Edge Functions (service_role uniquement)

create or replace function increment_run_counters(p_run_id uuid, p_ingested integer, p_rejected integer)
returns void language sql security definer as $$
  update pipeline_runs
  set rows_ingested = rows_ingested + p_ingested,
      rows_rejected = rows_rejected + p_rejected
  where id = p_run_id;
$$;

create or replace function refresh_materialized_views()
returns void language plpgsql security definer as $$
begin
  refresh materialized view concurrently mv_monthly_stats;
  refresh materialized view concurrently mv_commune_stats;
end $$;

revoke execute on function increment_run_counters(uuid, integer, integer) from anon, authenticated;
revoke execute on function refresh_materialized_views() from anon, authenticated;
revoke execute on function refresh_clean_mutations(date, date) from anon, authenticated;
