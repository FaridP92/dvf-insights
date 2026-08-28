-- =============================================================================
-- Extension à la France entière sur plan Free (500 Mo) : stockage frugal.
--   * le brut (dvf_mutations) devient un tampon : purgé dès qu'un département est nettoyé
--   * le détail nettoyé (dvf_mutations_clean) est conservé 12 mois glissants, colonnes allégées
--   * l'historique 36 mois vit dans des tables d'agrégats compactes (monthly_stats, commune_*)
-- =============================================================================

-- 1. Référentiel communes (alimenté depuis le brut, remplace nom_commune dans le détail)
create table if not exists communes (
  insee            text primary key,
  name             text not null,
  department_code  text not null references departments(code),
  lat              real,
  lng              real
);
alter table communes enable row level security;
create policy "lecture publique" on communes for select using (true);
create index if not exists communes_department_idx on communes (department_code);

insert into communes (insee, name, department_code, lat, lng)
select code_commune, mode() within group (order by nom_commune), max(code_departement),
       avg(latitude)::real, avg(longitude)::real
from dvf_mutations_clean group by code_commune
on conflict (insee) do nothing;

-- 2. Détail nettoyé allégé (nom_commune conservé jusqu'au déploiement du front, cf. 0008)
drop materialized view if exists mv_monthly_stats;
drop materialized view if exists mv_commune_stats;
alter table dvf_mutations_clean alter column longitude type real, alter column latitude type real;
alter table dvf_mutations_clean drop column if exists cleaned_at;
alter table dvf_mutations_clean add constraint clean_commune_fk
  foreign key (code_commune) references communes(insee) deferrable initially deferred;

-- 3. Agrégats persistants (remplacent les vues matérialisées)

create table if not exists monthly_stats (
  month                 text not null,
  department_code       text not null references departments(code),
  property_type         property_type not null,
  transactions          integer not null,
  median_price_per_sqm  numeric(10,2) not null,
  p10_price_per_sqm     numeric(10,2) not null,
  p90_price_per_sqm     numeric(10,2) not null,
  median_surface        numeric(10,2) not null,
  total_value           numeric(16,2) not null,
  refreshed_at          timestamptz not null default now(),
  primary key (month, department_code, property_type)
);
alter table monthly_stats enable row level security;
create policy "lecture publique" on monthly_stats for select using (true);

create table if not exists commune_yearly_stats (
  year                  integer not null,
  insee_code            text not null,
  property_type         property_type not null,
  transactions          integer not null,
  median_price_per_sqm  numeric(10,2) not null,
  primary key (year, insee_code, property_type)
);
alter table commune_yearly_stats enable row level security;
create policy "lecture publique" on commune_yearly_stats for select using (true);

create table if not exists commune_stats (
  insee_code            text not null,
  commune_name          text not null,
  department_code       text not null,
  property_type         property_type not null,
  transactions          integer not null,
  median_price_per_sqm  numeric(10,2) not null,
  yoy_change            numeric(8,4),
  volume_change         numeric(8,4),
  lat                   real,
  lng                   real,
  primary key (insee_code, property_type)
);
alter table commune_stats enable row level security;
create policy "lecture publique" on commune_stats for select using (true);
create index if not exists commune_stats_department_idx on commune_stats (department_code);

-- 4. Traitement d'un département : communes -> nettoyage -> agrégats -> purge du brut
create or replace function process_department(p_from date, p_to date, p_department text)
returns integer language plpgsql security definer set search_path = public as $$
declare cleaned integer;
begin
  insert into communes (insee, name, department_code, lat, lng)
  select code_commune, mode() within group (order by nom_commune), p_department,
         avg(latitude)::real, avg(longitude)::real
  from dvf_mutations
  where code_departement = p_department and date_mutation >= p_from and date_mutation < p_to
    and exists (select 1 from departments d where d.code = p_department)
  group by code_commune
  on conflict (insee) do update set name = excluded.name,
    lat = coalesce(excluded.lat, communes.lat), lng = coalesce(excluded.lng, communes.lng);

  delete from dvf_mutations_clean
   where code_departement = p_department and date_mutation >= p_from and date_mutation < p_to;

  with singles as (
    select id_mutation from dvf_mutations
    where code_departement = p_department and date_mutation >= p_from and date_mutation < p_to
      and nature_mutation = 'Vente'
    group by id_mutation having count(*) = 1
  )
  insert into dvf_mutations_clean
    (id, date_mutation, code_commune, nom_commune, code_departement, property_type, price, surface, rooms, land_surface, longitude, latitude)
  select m.id_mutation, m.date_mutation, m.code_commune, m.nom_commune, m.code_departement,
         case m.type_local when 'Appartement' then 'appartement'::property_type else 'maison'::property_type end,
         m.valeur_fonciere, m.surface_reelle_bati, coalesce(m.nombre_pieces, 0), coalesce(m.surface_terrain, 0),
         m.longitude::real, m.latitude::real
  from dvf_mutations m join singles s on s.id_mutation = m.id_mutation
  where m.code_departement = p_department and m.date_mutation >= p_from and m.date_mutation < p_to
    and m.type_local in ('Appartement', 'Maison') and m.valeur_fonciere > 0 and m.surface_reelle_bati >= 9
    and m.valeur_fonciere / m.surface_reelle_bati between 200 and 30000
    and exists (select 1 from communes c where c.insee = m.code_commune)
  on conflict (id) do nothing;
  get diagnostics cleaned = row_count;

  delete from monthly_stats
   where department_code = p_department and month >= to_char(p_from, 'YYYY-MM') and month < to_char(p_to, 'YYYY-MM');
  insert into monthly_stats (month, department_code, property_type, transactions, median_price_per_sqm,
                             p10_price_per_sqm, p90_price_per_sqm, median_surface, total_value)
  select to_char(date_trunc('month', date_mutation), 'YYYY-MM'), code_departement, property_type, count(*)::integer,
         percentile_cont(0.5) within group (order by price_per_sqm),
         percentile_cont(0.1) within group (order by price_per_sqm),
         percentile_cont(0.9) within group (order by price_per_sqm),
         percentile_cont(0.5) within group (order by surface), sum(price)
  from dvf_mutations_clean
  where code_departement = p_department and date_mutation >= p_from and date_mutation < p_to
  group by 1, 2, 3;

  delete from commune_yearly_stats
   where insee_code in (select insee from communes where department_code = p_department)
     and year >= extract(year from p_from) and year < extract(year from p_to);
  insert into commune_yearly_stats (year, insee_code, property_type, transactions, median_price_per_sqm)
  select extract(year from date_mutation)::integer, code_commune, property_type, count(*)::integer,
         percentile_cont(0.5) within group (order by price_per_sqm)
  from dvf_mutations_clean
  where code_departement = p_department and date_mutation >= p_from and date_mutation < p_to
  group by 1, 2, 3;

  -- le brut est un tampon : purgé une fois le département agrégé
  delete from dvf_mutations
   where code_departement = p_department and date_mutation >= p_from and date_mutation < p_to;

  return cleaned;
end $$;
revoke execute on function process_department(date, date, text) from public, anon, authenticated;

-- 5. Clôture d'un run : rétention et reconstruction de commune_stats
create or replace function finalize_run()
returns jsonb language plpgsql security definer set search_path = public as $$
declare horizon date; pruned integer; kept_months text;
begin
  select max(date_mutation) into horizon from dvf_mutations_clean;
  if horizon is null then return jsonb_build_object('pruned', 0); end if;

  -- détail : 12 mois glissants
  delete from dvf_mutations_clean where date_mutation < (horizon - interval '12 months');
  get diagnostics pruned = row_count;
  -- agrégats mensuels : 36 mois
  kept_months := to_char(horizon - interval '36 months', 'YYYY-MM');
  delete from monthly_stats where month < kept_months;

  -- communes : 12 mois glissants vs les 12 mois précédents (année civile précédente comme référence)
  delete from commune_stats;
  insert into commune_stats (insee_code, commune_name, department_code, property_type, transactions,
                             median_price_per_sqm, yoy_change, volume_change, lat, lng)
  select cur.code_commune, c.name, c.department_code, cur.property_type, cur.transactions, cur.median_ppsqm,
         case when prev.median_price_per_sqm > 0 then (cur.median_ppsqm - prev.median_price_per_sqm) / prev.median_price_per_sqm end,
         case when prev.transactions > 0 then (cur.transactions - prev.transactions)::numeric / prev.transactions end,
         c.lat, c.lng
  from (
    select code_commune, property_type, count(*)::integer as transactions,
           percentile_cont(0.5) within group (order by price_per_sqm) as median_ppsqm
    from dvf_mutations_clean where date_mutation > (horizon - interval '12 months')
    group by 1, 2
  ) cur
  join communes c on c.insee = cur.code_commune
  left join commune_yearly_stats prev
    on prev.insee_code = cur.code_commune and prev.property_type = cur.property_type
   and prev.year = extract(year from horizon)::integer - 1
  where cur.transactions >= 10;

  return jsonb_build_object('pruned', pruned, 'horizon', horizon, 'communes', (select count(*) from commune_stats));
end $$;
revoke execute on function finalize_run() from public, anon, authenticated;

-- 6. File de jobs : deux natures (département, clôture)
alter table maintenance_jobs add column if not exists kind text not null default 'finalize' check (kind in ('department', 'finalize'));
alter table maintenance_jobs add column if not exists department text;

create or replace function enqueue_department_job(p_run_id uuid, p_from date, p_to date, p_department text)
returns uuid language sql security definer set search_path = public as $$
  insert into maintenance_jobs (run_id, period_from, period_to, kind, department)
  values (p_run_id, p_from, p_to, 'department', p_department) returning id;
$$;
revoke execute on function enqueue_department_job(uuid, date, date, text) from public, anon, authenticated;
grant execute on function enqueue_department_job(uuid, date, date, text) to service_role;

create or replace function process_maintenance_jobs()
returns integer language plpgsql security definer set search_path = public as $$
declare job record; res jsonb; cleaned integer; processed integer := 0;
begin
  for job in select * from maintenance_jobs where status = 'queued' order by created_at for update skip locked loop
    update maintenance_jobs set status = 'running', started_at = now() where id = job.id;
    begin
      if job.kind = 'department' then
        cleaned := process_department(job.period_from, job.period_to, job.department);
        res := jsonb_build_object('cleaned', cleaned, 'department', job.department);
        update pipeline_runs
           set metadata = metadata || jsonb_build_object('cleaned', coalesce((metadata->>'cleaned')::integer, 0) + cleaned)
         where id = job.run_id;
      else
        res := finalize_run();
        update pipeline_runs
           set status = 'success', finished_at = now(), metadata = metadata || res || '{"stage":"done"}'::jsonb
         where id = job.run_id;
      end if;
      update maintenance_jobs set status = 'done', finished_at = now(), result = res where id = job.id;
    exception when others then
      update maintenance_jobs set status = 'failed', finished_at = now(), result = jsonb_build_object('error', sqlerrm) where id = job.id;
      update pipeline_runs set status = 'failed', finished_at = now(), error_message = job.kind || ' ' || coalesce(job.department, '') || ' : ' || sqlerrm
       where id = job.run_id;
    end;
    processed := processed + 1;
  end loop;
  return processed;
end $$;

-- 7. Santé : raw_rows reflète le tampon, clean_rows le détail 12 mois
create or replace function get_database_health()
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'checked_at', now(),
    'active_connections', (select count(*) from pg_stat_activity where state = 'active'),
    'max_connections', (select setting::int from pg_settings where name = 'max_connections'),
    'cache_hit_ratio', (select round(sum(blks_hit)::numeric / nullif(sum(blks_hit + blks_read), 0), 4) from pg_stat_database),
    'db_size_bytes', pg_database_size(current_database()),
    'raw_rows', (select coalesce(sum(n_live_tup), 0) from pg_stat_user_tables where relname like 'dvf_mutations_2%'),
    'clean_rows', (select n_live_tup from pg_stat_user_tables where relname = 'dvf_mutations_clean'),
    'last_refresh_at', (select max(finished_at) from pipeline_runs where status = 'success')
  );
$$;
grant select on monthly_stats, commune_stats, communes, commune_yearly_stats to anon, authenticated;

-- 8. Reprise de l'existant : agrégats depuis le détail déjà chargé, brut purgé (tampon), clôture
insert into monthly_stats (month, department_code, property_type, transactions, median_price_per_sqm,
                           p10_price_per_sqm, p90_price_per_sqm, median_surface, total_value)
select to_char(date_trunc('month', date_mutation), 'YYYY-MM'), code_departement, property_type, count(*)::integer,
       percentile_cont(0.5) within group (order by price_per_sqm),
       percentile_cont(0.1) within group (order by price_per_sqm),
       percentile_cont(0.9) within group (order by price_per_sqm),
       percentile_cont(0.5) within group (order by surface), sum(price)
from dvf_mutations_clean group by 1, 2, 3
on conflict do nothing;

insert into commune_yearly_stats (year, insee_code, property_type, transactions, median_price_per_sqm)
select extract(year from date_mutation)::integer, code_commune, property_type, count(*)::integer,
       percentile_cont(0.5) within group (order by price_per_sqm)
from dvf_mutations_clean group by 1, 2, 3
on conflict do nothing;

truncate dvf_mutations;
select finalize_run();

-- 9. Vues de compatibilité (anciens noms lus par le front en production), supprimées en 0008
create view mv_monthly_stats as
  select month, department_code, property_type, transactions, median_price_per_sqm,
         p10_price_per_sqm, p90_price_per_sqm, median_surface, total_value from monthly_stats;
create view mv_commune_stats as
  select insee_code, commune_name, department_code, property_type, transactions, median_price_per_sqm,
         yoy_change, volume_change, lat, lng from commune_stats;
grant select on mv_monthly_stats, mv_commune_stats to anon, authenticated;
