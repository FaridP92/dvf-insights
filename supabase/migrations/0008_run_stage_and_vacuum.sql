-- Clôture : fusionner les métadonnées du run au lieu de les remplacer (compteur cleaned conservé)
create or replace function mark_run_refresh(p_run_id uuid, p_job_id uuid)
returns void language sql security definer set search_path = public as $$
  update pipeline_runs
     set metadata = metadata || jsonb_build_object('stage', 'refresh', 'maintenance_job', p_job_id)
   where id = p_run_id;
$$;
revoke execute on function mark_run_refresh(uuid, uuid) from public, anon, authenticated;
grant execute on function mark_run_refresh(uuid, uuid) to service_role;

-- Espace libéré par la rétention réutilisable : VACUUM quotidien (pg_cron accepte VACUUM hors transaction)
select cron.schedule('dvf-vacuum', '30 4 * * *', $$vacuum (analyze) dvf_mutations_clean, dvf_mutations, maintenance_jobs, webhook_events$$);
