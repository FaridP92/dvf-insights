-- =============================================================================
-- DVF Insights : schéma PostgreSQL (Supabase)
-- Pipeline : dvf_mutations (brut, alimenté par n8n)
--          -> dvf_mutations_clean (dédoublonné, prix/m², filtre outliers)
--          -> vues matérialisées d'agrégation consommées par le front
--          -> tables de monitoring (pipeline_runs, webhook_events)
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Référentiels
-- -----------------------------------------------------------------------------
create table if not exists departments (
  code        text primary key,
  name        text not null,
  region      text not null,
  housing_stock integer  -- parc de logements (INSEE), sert au taux de rotation
);

create type property_type as enum ('appartement', 'maison');

-- -----------------------------------------------------------------------------
-- 2. Données brutes DVF (une ligne = une disposition/lot du fichier data.gouv)
--    Partitionnée par année de mutation pour l'ingestion incrémentale et le purge.
-- -----------------------------------------------------------------------------
create table if not exists dvf_mutations (
  id                bigint generated always as identity,
  id_mutation       text not null,
  date_mutation     date not null,
  nature_mutation   text not null,
  valeur_fonciere   numeric(14,2),
  code_commune      text not null,
  nom_commune       text not null,
  code_departement  text not null,
  type_local        text,
  surface_reelle_bati numeric(10,2),
  nombre_pieces     smallint,
  surface_terrain   numeric(12,2),
  longitude         double precision,
  latitude          double precision,
  ingested_at       timestamptz not null default now(),
  primary key (id, date_mutation)
) partition by range (date_mutation);

create table if not exists dvf_mutations_2022 partition of dvf_mutations
  for values from ('2022-01-01') to ('2023-01-01');
create table if not exists dvf_mutations_2023 partition of dvf_mutations
  for values from ('2023-01-01') to ('2024-01-01');
create table if not exists dvf_mutations_2024 partition of dvf_mutations
  for values from ('2024-01-01') to ('2025-01-01');
create table if not exists dvf_mutations_2025 partition of dvf_mutations
  for values from ('2025-01-01') to ('2026-01-01');
create table if not exists dvf_mutations_2026 partition of dvf_mutations
  for values from ('2026-01-01') to ('2027-01-01');

create index if not exists dvf_mutations_id_mutation_idx on dvf_mutations (id_mutation);
create index if not exists dvf_mutations_dept_date_idx on dvf_mutations (code_departement, date_mutation);

-- -----------------------------------------------------------------------------
-- 3. Données nettoyées : une ligne = un bien vendu, exploitable statistiquement
--    Règles :
--      - ventes uniquement ("Vente", "Vente en l'état futur d'achèvement" exclue)
--      - une seule ligne par id_mutation (exclut les ventes en bloc multi-lots)
--      - appartement ou maison, surface >= 9 m², prix > 0
--      - prix/m² dans [200, 30 000] : hors de cette plage la donnée est presque
--        toujours une erreur de saisie ou une cession non marchande
-- -----------------------------------------------------------------------------
create table if not exists dvf_mutations_clean (
  id                text primary key,             -- id_mutation
  date_mutation     date not null,
  code_commune      text not null,
  nom_commune       text not null,
  code_departement  text not null references departments(code),
  property_type     property_type not null,
  price             numeric(14,2) not null check (price > 0),
  surface           numeric(10,2) not null check (surface >= 9),
  rooms             smallint not null default 0,
  land_surface      numeric(12,2) not null default 0,
  price_per_sqm     numeric(10,2) generated always as (price / surface) stored,
  longitude         double precision,
  latitude          double precision,
  cleaned_at        timestamptz not null default now(),
  constraint price_per_sqm_plausible check (price / surface between 200 and 30000)
);

create index if not exists clean_dept_type_date_idx
  on dvf_mutations_clean (code_departement, property_type, date_mutation);
create index if not exists clean_commune_idx on dvf_mutations_clean (code_commune);

-- Fonction de nettoyage idempotente, appelée par n8n après chaque ingestion.
create or replace function refresh_clean_mutations(p_from date, p_to date)
returns integer language plpgsql security definer as $$
declare inserted integer;
begin
  with singles as (
    select id_mutation
    from dvf_mutations
    where date_mutation >= p_from and date_mutation < p_to
      and nature_mutation = 'Vente'
    group by id_mutation
    having count(*) = 1
  )
  insert into dvf_mutations_clean
    (id, date_mutation, code_commune, nom_commune, code_departement, property_type,
     price, surface, rooms, land_surface, longitude, latitude)
  select m.id_mutation, m.date_mutation, m.code_commune, m.nom_commune, m.code_departement,
         case m.type_local when 'Appartement' then 'appartement'::property_type
                           else 'maison'::property_type end,
         m.valeur_fonciere, m.surface_reelle_bati, coalesce(m.nombre_pieces, 0),
         coalesce(m.surface_terrain, 0), m.longitude, m.latitude
  from dvf_mutations m
  join singles s on s.id_mutation = m.id_mutation
  where m.date_mutation >= p_from and m.date_mutation < p_to
    and m.type_local in ('Appartement', 'Maison')
    and m.valeur_fonciere > 0
    and m.surface_reelle_bati >= 9
    and m.valeur_fonciere / m.surface_reelle_bati between 200 and 30000
    and exists (select 1 from departments d where d.code = m.code_departement)
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Agrégats pré-calculés (vues matérialisées, rafraîchies par n8n)
-- -----------------------------------------------------------------------------
create materialized view if not exists mv_monthly_stats as
select
  to_char(date_trunc('month', date_mutation), 'YYYY-MM')          as month,
  code_departement                                                 as department_code,
  property_type,
  count(*)::integer                                                as transactions,
  percentile_cont(0.5)  within group (order by price_per_sqm)      as median_price_per_sqm,
  percentile_cont(0.1)  within group (order by price_per_sqm)      as p10_price_per_sqm,
  percentile_cont(0.9)  within group (order by price_per_sqm)      as p90_price_per_sqm,
  percentile_cont(0.5)  within group (order by surface)            as median_surface,
  sum(price)                                                       as total_value
from dvf_mutations_clean
group by 1, 2, 3;

create unique index if not exists mv_monthly_stats_pk
  on mv_monthly_stats (month, department_code, property_type);

create materialized view if not exists mv_commune_stats as
with last12 as (
  select * from dvf_mutations_clean
  where date_mutation >= (current_date - interval '12 months')
), prev12 as (
  select * from dvf_mutations_clean
  where date_mutation >= (current_date - interval '24 months')
    and date_mutation <  (current_date - interval '12 months')
), cur as (
  select code_commune, max(nom_commune) as nom_commune, max(code_departement) as code_departement,
         property_type, count(*)::integer as transactions,
         percentile_cont(0.5) within group (order by price_per_sqm) as median_ppsqm,
         avg(latitude) as lat, avg(longitude) as lng
  from last12 group by code_commune, property_type
), prev as (
  select code_commune, property_type, count(*)::integer as transactions,
         percentile_cont(0.5) within group (order by price_per_sqm) as median_ppsqm
  from prev12 group by code_commune, property_type
)
select
  cur.code_commune                            as insee_code,
  cur.nom_commune                             as commune_name,
  cur.code_departement                        as department_code,
  cur.property_type,
  cur.transactions,
  cur.median_ppsqm                            as median_price_per_sqm,
  case when prev.median_ppsqm > 0
       then (cur.median_ppsqm - prev.median_ppsqm) / prev.median_ppsqm else null end as yoy_change,
  case when prev.transactions > 0
       then (cur.transactions - prev.transactions)::numeric / prev.transactions else null end as volume_change,
  cur.lat, cur.lng
from cur left join prev using (code_commune, property_type)
where cur.transactions >= 10;

create unique index if not exists mv_commune_stats_pk
  on mv_commune_stats (insee_code, property_type);

-- -----------------------------------------------------------------------------
-- 5. Monitoring des pipelines (alimenté par les webhooks n8n)
-- -----------------------------------------------------------------------------
create type pipeline_status as enum ('queued', 'running', 'success', 'failed');

create table if not exists pipeline_runs (
  id             uuid primary key default gen_random_uuid(),
  workflow_name  text not null,
  status         pipeline_status not null default 'queued',
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  rows_ingested  integer not null default 0,
  rows_rejected  integer not null default 0,
  duration_ms    integer generated always as
                 (case when finished_at is null then null
                       else (extract(epoch from (finished_at - started_at)) * 1000)::integer end) stored,
  error_message  text,
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists pipeline_runs_started_idx on pipeline_runs (started_at desc);

create table if not exists webhook_events (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  received_at   timestamptz not null default now(),
  status_code   smallint not null,
  latency_ms    integer not null,
  payload_bytes integer not null,
  run_id        uuid references pipeline_runs(id) on delete set null
);
create index if not exists webhook_events_received_idx on webhook_events (received_at desc);

-- Santé de la base, exposée en lecture via RPC pour la page monitoring
create or replace function get_database_health()
returns jsonb language sql security definer stable as $$
  select jsonb_build_object(
    'checked_at', now(),
    'active_connections', (select count(*) from pg_stat_activity where state = 'active'),
    'max_connections', (select setting::int from pg_settings where name = 'max_connections'),
    'cache_hit_ratio', (select round(sum(blks_hit)::numeric / nullif(sum(blks_hit + blks_read), 0), 4)
                        from pg_stat_database),
    'db_size_bytes', pg_database_size(current_database()),
    'raw_rows', (select coalesce(sum(n_live_tup), 0) from pg_stat_user_tables where relname like 'dvf_mutations_2%'),
    'clean_rows', (select n_live_tup from pg_stat_user_tables where relname = 'dvf_mutations_clean'),
    'last_refresh_at', (select max(finished_at) from pipeline_runs where status = 'success')
  );
$$;

-- -----------------------------------------------------------------------------
-- 6. Sécurité : lecture publique des agrégats et du monitoring, écriture réservée
--    à la clé service_role (utilisée uniquement par les Edge Functions / n8n).
-- -----------------------------------------------------------------------------
alter table dvf_mutations enable row level security;
alter table dvf_mutations_clean enable row level security;
alter table pipeline_runs enable row level security;
alter table webhook_events enable row level security;
alter table departments enable row level security;

create policy "lecture publique" on dvf_mutations_clean for select using (true);
create policy "lecture publique" on pipeline_runs for select using (true);
create policy "lecture publique" on webhook_events for select using (true);
create policy "lecture publique" on departments for select using (true);
-- dvf_mutations (brut) : aucune policy select, donc invisible à la clé anon.

grant select on mv_monthly_stats, mv_commune_stats to anon, authenticated;
grant execute on function get_database_health() to anon, authenticated;
