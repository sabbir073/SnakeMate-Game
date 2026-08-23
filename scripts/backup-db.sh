#!/usr/bin/env bash
# PostgreSQL backup (spec §70). Run from repo root; intended for daily cron:
#   0 4 * * * /path/to/repo/scripts/backup-db.sh >> /var/log/nibblio-backup.log 2>&1
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres pg_dump -U nibblio -d nibblio --format=custom \
  > "$BACKUP_DIR/nibblio-$STAMP.dump"

# retention
find "$BACKUP_DIR" -name "nibblio-*.dump" -mtime "+$RETAIN_DAYS" -delete

SIZE=$(du -h "$BACKUP_DIR/nibblio-$STAMP.dump" | cut -f1)
echo "[backup] $STAMP ok ($SIZE) → $BACKUP_DIR/nibblio-$STAMP.dump"
