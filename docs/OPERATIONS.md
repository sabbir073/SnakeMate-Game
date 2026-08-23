# OPERATIONS

Daily-driver commands (run in /opt/nibblio, prod overlay implied):

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| Live logs | `docker compose logs -f game-server` |
| Player/tick stats | see docs/MONITORING.md `/metrics` |
| Deploy release | docs/DEPLOYMENT.md procedure |
| Rollback | docs/DEPLOYMENT.md rollback |
| Backup now | `./scripts/backup-db.sh` |
| Restore | `./scripts/restore-db.sh <dump>` |
| Health sweep | `./scripts/healthwatch.sh` |
| Restart server only | `docker compose restart game-server` (graceful; drains) |
| DB console | `docker compose exec postgres psql -U nibblio -d nibblio` |
| Redis console | `docker compose exec redis redis-cli` |

## Maintenance cadence (spec §125–126)

- **Monthly**: `apt update && apt upgrade`, `docker compose pull` + redeploy,
  review `pnpm audit` output (document any accepted advisories in
  RELEASES.md), check disk (`df -h`) and backup log.
- **Quarterly**: restore drill (BACKUPS.md), rotate POSTGRES_PASSWORD +
  SESSION_SECRET (update .env, `up -d`), review audit_events volume,
  `VACUUM ANALYZE` runs via autovacuum — verify with
  `SELECT relname, last_autovacuum FROM pg_stat_user_tables`.

## Incident quick-path

1. `./scripts/healthwatch.sh` → what's red?
2. `docker compose logs --tail 200 game-server` → error events are JSON.
3. Restart the sick service (`docker compose restart <svc>`).
4. Full recovery: docs/TROUBLESHOOTING.md.
