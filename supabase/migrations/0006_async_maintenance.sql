-- Nettoyage et rafraîchissement asynchrones : l'Edge Function enfile un job, pg_cron l'exécute
-- (pas de statement_timeout côté cron, contrairement aux appels RPC via PostgREST).
create extension if not exists pg_cron;

create table if not exists maintenance_jobs (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid references pipeline_runs(id) on delete set null,
  period_from  date not null,
  period_to    date not null,
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  result       jsonb not null default '{}'::jsonb
);
alter table maintenance_jobs enable row level security;
create policy "lecture publique" on maintenance_jobs for select using (true);

create or replace function enqueue_maintenance(p_run_id uuid, p_from date, p_to date)
returns uuid language sql security definer set search_path = public as $$
  insert into maintenance_jobs (run_id, period_from, period_to) values (p_run_id, p_from, p_to) returning id;
$$;
revoke execute on function enqueue_maintenance(uuid, date, date) from public, anon, authenticated;
grant execute on function enqueue_maintenance(uuid, date, date) to service_role;

create or replace function process_maintenance_jobs()
returns integer language plpgsql security definer set search_path = public as $$
declare job record; cleaned integer; processed integer := 0;
begin
  for job in select * from maintenance_jobs where status = 'queued' order by created_at for update skip locked loop
    update maintenance_jobs set status = 'running', started_at = now() where id = job.id;
    begin
      cleaned := refresh_clean_mutations(job.period_from, job.period_to);
      refresh materialized view concurrently mv_monthly_stats;
      refresh materialized view concurrently mv_commune_stats;
      update maintenance_jobs
         set status = 'done', finished_at = now(), result = jsonb_build_object('cleaned', cleaned)
       where id = job.id;
      update pipeline_runs
         set status = 'success', finished_at = now(),
             metadata = metadata || jsonb_build_object('cleaned', cleaned, 'stage', 'done')
       where id = job.run_id;
    exception when others then
      update maintenance_jobs
         set status = 'failed', finished_at = now(), result = jsonb_build_object('error', sqlerrm)
       where id = job.id;
      update pipeline_runs
         set status = 'failed', finished_at = now(), error_message = 'Nettoyage : ' || sqlerrm
       where id = job.run_id;
    end;
    processed := processed + 1;
  end loop;
  return processed;
end $$;
revoke execute on function process_maintenance_jobs() from public, anon, authenticated;

select cron.schedule('dvf-maintenance', '* * * * *', $$select process_maintenance_jobs()$$);
