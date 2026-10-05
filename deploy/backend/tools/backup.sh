#!/usr/bin/env bash
# Sauvegarde quotidienne de la base DVF (pg_dump au format custom, compressé), rétention 14 jours.
# Planifié par /etc/cron.d/dvf-backup. Restauration :
#   docker compose exec -T db pg_restore -U postgres -d dvf --clean --if-exists < /var/backups/dvf/dvf-AAAAMMJJ-HHMMSS.dump
set -euo pipefail
DEST=/var/backups/dvf
mkdir -p "$DEST"
cd /opt/dvf-backend/deploy/backend
OUT="$DEST/dvf-$(date -u +%Y%m%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U postgres -d dvf -Fc -Z 6 > "$OUT"
[ -s "$OUT" ] || { echo "dump vide" >&2; rm -f "$OUT"; exit 1; }
find "$DEST" -name 'dvf-*.dump' -mtime +14 -delete
