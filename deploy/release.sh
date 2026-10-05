#!/usr/bin/env bash
# Gestion des releases de dvf.lyfh.fr côté VPS (exécuté via SSH, jamais en local).
#
#   bash -s -- activate <release>   bascule `current` vers releases/<release> (atomique), purge les anciennes
#   bash -s -- rollback             rebascule `current` vers la release précédente
#   bash -s -- list                 liste les releases (la courante est marquée *)
#
# Layout : $BASE/releases/<AAAAMMJJHHMMSS>-<sha>/  et  $BASE/current -> releases/<release>
# Plesk sert $BASE/current (docroot), nginx suit le lien symbolique à chaque requête.
set -euo pipefail

BASE="${DVF_BASE:-/var/www/vhosts/lyfh.fr/dvf.lyfh.fr}"
KEEP="${DVF_KEEP:-5}"
cmd="${1:-}"

current_name() { basename "$(readlink "$BASE/current" 2>/dev/null || true)"; }
all_releases() { ls -1 "$BASE/releases" | sort; }

switch_to() {
  local rel="$1"
  [ -f "$BASE/releases/$rel/index.html" ] || { echo "release invalide (index.html absent) : $rel" >&2; exit 1; }
  ln -sfn "releases/$rel" "$BASE/current.tmp"
  mv -Tf "$BASE/current.tmp" "$BASE/current"
  echo "current -> releases/$rel"
}

case "$cmd" in
  activate)
    rel="${2:?release manquante}"
    switch_to "$rel"
    # Purge : on garde les $KEEP plus récentes et toujours la courante.
    cur="$(current_name)"
    all_releases | head -n "-$KEEP" | while read -r old; do
      [ "$old" = "$cur" ] || rm -rf "${BASE:?}/releases/$old"
    done
    ;;
  rollback)
    cur="$(current_name)"
    prev="$(all_releases | grep -B1 -x "$cur" | head -n1 || true)"
    { [ -n "$prev" ] && [ "$prev" != "$cur" ]; } || { echo "aucune release précédente" >&2; exit 1; }
    switch_to "$prev"
    ;;
  list)
    cur="$(current_name)"
    all_releases | while read -r r; do [ "$r" = "$cur" ] && echo "* $r" || echo "  $r"; done
    ;;
  *)
    echo "usage : release.sh activate <release> | rollback | list" >&2
    exit 2
    ;;
esac
