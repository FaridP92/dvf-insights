-- Remise à zéro fine : (millésime, département) est l'unité de remplacement.
-- Appelée par ingest-dvf sur le premier lot d'un département, avant insertion.
create or replace function purge_department(p_from date, p_to date, p_department text)
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from dvf_mutations_clean
   where date_mutation >= p_from and date_mutation < p_to and code_departement = p_department;
  delete from dvf_mutations
   where date_mutation >= p_from and date_mutation < p_to and code_departement = p_department;
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke execute on function purge_department(date, date, text) from public, anon, authenticated;
grant execute on function purge_department(date, date, text) to service_role;
