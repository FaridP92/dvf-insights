#!/usr/bin/env python3
"""Copie les tables lisibles publiquement d'un projet Supabase vers le Postgres du VPS.

Usage (sur le VPS, depuis deploy/backend) :
  SRC_URL=https://<ref>.supabase.co SRC_KEY=<clé anon> python3 tools/migrate-from-supabase.py export /opt/dvf-backend/export
  python3 tools/migrate-from-supabase.py load /opt/dvf-backend/export

export : pagination par l'API REST (clé anon, policies "lecture publique"), un fichier NDJSON par table.
load   : charge chaque fichier dans la base locale (conteneur db) via jsonb_populate_record, ce qui
         conserve les types et distingue NULL de chaîne vide. Les colonnes générées sont recalculées.
"""
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

PAGE = 1000
# table -> (colonnes de tri, pagination par clé sur la 1re colonne ?)
TABLES = {
    'departments': (['code'], False),
    'communes': (['insee'], False),
    'commune_stats': (['insee_code', 'property_type'], False),
    'commune_yearly_stats': (['year', 'insee_code', 'property_type'], False),
    'monthly_stats': (['month', 'department_code', 'property_type'], False),
    'dvf_mutations_clean': (['id'], True),
    'pipeline_runs': (['id'], False),
    'webhook_events': (['id'], False),
    'maintenance_jobs': (['id'], False),
}


def fetch(url: str, key: str):
    req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except Exception as exc:  # noqa: BLE001
            if attempt == 5:
                raise
            print(f'  retry {attempt + 1} ({exc})', flush=True)
            time.sleep(2 * (attempt + 1))


def export(out_dir: str) -> None:
    src, key = os.environ['SRC_URL'].rstrip('/'), os.environ['SRC_KEY']
    os.makedirs(out_dir, exist_ok=True)
    for table, (order, keyset) in TABLES.items():
        path = os.path.join(out_dir, f'{table}.ndjson')
        total, offset, last = 0, 0, None
        order_q = ','.join(f'{c}.asc' for c in order)
        with open(path, 'w', encoding='utf-8') as fh:
            while True:
                q = f'select=*&order={order_q}&limit={PAGE}'
                if keyset and last is not None:
                    q += f'&{order[0]}=gt.{urllib.parse.quote(str(last), safe="")}'
                elif not keyset:
                    q += f'&offset={offset}'
                rows = fetch(f'{src}/rest/v1/{table}?{q}', key)
                for row in rows:
                    fh.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
                total += len(rows)
                offset += len(rows)
                if rows:
                    last = rows[-1][order[0]]
                if total % 50000 < PAGE and rows:
                    print(f'  {table}: {total}', flush=True)
                if len(rows) < PAGE:
                    break
        print(f'{table}: {total} lignes -> {path}', flush=True)


def psql(sql: str, stdin=subprocess.DEVNULL) -> str:
    cmd = ['docker', 'compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'dvf', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]
    res = subprocess.run(cmd, stdin=stdin, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip())
    return res.stdout.strip()


def load(in_dir: str) -> None:
    for table in TABLES:
        cols = psql(
            "select string_agg(quote_ident(column_name), ',' order by ordinal_position) "
            f"from information_schema.columns where table_schema='public' and table_name='{table}' "
            "and is_generated='NEVER' and (column_default is null or column_default not like 'nextval%')"
        ).splitlines()[-1]
        path = os.path.join(in_dir, f'{table}.ndjson')
        # Charge le NDJSON ligne à ligne dans une table de staging (format CSV avec délimiteurs improbables).
        before = (
            'begin; set session_replication_role = replica; '
            f'delete from {table}; '
            'create temp table stg(doc jsonb) on commit drop; '
            "copy stg from stdin with (format csv, quote e'\\x01', delimiter e'\\x02');\n"
        )
        after = (
            f'insert into {table} ({cols}) select {cols} from stg, jsonb_populate_record(null::{table}, doc); '
            'commit;\n'
        )
        with open(path, 'rb') as fh:
            res = subprocess.run(
                ['docker', 'compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'dvf', '-v', 'ON_ERROR_STOP=1', '-q'],
                input=before.encode() + fh.read() + b'\\.\n' + after.encode(),
                capture_output=True,
            )
        if res.returncode != 0:
            raise RuntimeError(f'{table}: {res.stderr.decode()[:500]}')
        print(f'{table}: {psql(f"select count(*) from {table}")} lignes chargées', flush=True)


if __name__ == '__main__':
    mode, directory = sys.argv[1], sys.argv[2]
    {'export': export, 'load': load}[mode](directory)
