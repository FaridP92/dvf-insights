#!/usr/bin/env bash
# Rôles et privilèges équivalents à ceux d'un projet Supabase, exécuté une seule fois à l'initialisation.
# Les migrations du dépôt (supabase/migrations) s'appuient dessus : anon, authenticated, service_role,
# RLS comme barrière d'accès, privilèges par défaut larges (c'est la RLS qui filtre).
set -euo pipefail
psql -v ON_ERROR_STOP=1 -v pw="$AUTHENTICATOR_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password :'pw';
grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;

-- Garde-fous de durée (mêmes ordres de grandeur que Supabase). Le nettoyage lourd passe par pg_cron.
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
alter role service_role set statement_timeout = '60s';
SQL
