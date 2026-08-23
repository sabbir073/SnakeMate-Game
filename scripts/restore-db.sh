#!/usr/bin/env bash
# PostgreSQL restore (spec §70/§121). DESTRUCTIVE — restores over the live DB.
#   scripts/restore-db.sh backups/nibblio-YYYYmmdd-HHMMSS.dump
set -euo pipefail
DUMP="${1:?usage: restore-db.sh <dumpfile>}"
echo "Restoring $DUMP over the 'nibblio' database in 5s — Ctrl+C to abort"
sleep 5
docker compose exec -T postgres pg_restore -U nibblio -d nibblio --clean --if-exists \
  < "$DUMP"
echo "[restore] done — verify with: docker compose exec postgres psql -U nibblio -d nibblio -c '\\dt'"
