# BACKUPS

## What & when (spec §70)

PostgreSQL is the only durable store (Redis holds ephemeral rate-limit/
presence data; game state is in-memory by design). Daily `pg_dump` at 04:00
via cron, custom format, 7-day retention:

```
0 4 * * * cd /opt/nibblio && ./scripts/backup-db.sh >> /var/log/nibblio-backup.log 2>&1
```

Location: `./backups/nibblio-<stamp>.dump` (override with BACKUP_DIR; copy
off-host — e.g. rclone to object storage — for real disaster recovery).

## Restore

```bash
./scripts/restore-db.sh backups/nibblio-YYYYmmdd-HHMMSS.dump
```
(DESTRUCTIVE: --clean --if-exists over the live DB.)

## Restore drill (do this quarterly)

```bash
docker compose exec -T postgres createdb -U nibblio nibblio_drill
docker compose exec -T postgres pg_restore -U nibblio -d nibblio_drill < backups/<latest>.dump
docker compose exec -T postgres psql -U nibblio -d nibblio_drill -c "SELECT count(*) FROM player_statistics"
docker compose exec -T postgres dropdb -U nibblio nibblio_drill
```

Accepted loss window: since the last nightly dump + up to one 10 s stats
flush (docs/DATABASE.md).
