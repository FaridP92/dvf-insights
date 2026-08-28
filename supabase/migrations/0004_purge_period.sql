-- Idempotence des runs : une période (millésime) est l'unité de remplacement.
-- Appelée à l'ouverture d'un run par pipeline-status quand une période est fournie.
create or replace function purge_period(p_from date, p_to date)
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from dvf_mutations_clean where date_mutation >= p_from and date_mutation < p_to;
  delete from dvf_mutations where date_mutation >= p_from and date_mutation < p_to;
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke execute on function purge_period(date, date) from public, anon, authenticated;
grant execute on function purge_period(date, date) to service_role;
