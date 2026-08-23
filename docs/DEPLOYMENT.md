# DEPLOYMENT

## Environments

dev (pnpm dev) → staging (compose overlay, own secrets/volumes/subdomain) →
production (VPS, compose + prod overlay). Never test destructive changes on
production (spec §119).

## Production deploy procedure (spec §120)

```bash
cd /opt/nibblio
git fetch && git checkout <release-tag>          # 1. pin the release
grep -c . .env || exit 1                         # 2. env sanity (see below)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build   # 3. build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d   # 4. roll
sleep 15
curl -sf https://$DOMAIN/health && curl -sf https://$DOMAIN/ready       # 5. health
node scripts/ws-smoke.mjs wss://$DOMAIN/ws       # 6. WS smoke (2 bots join+play)
```

Migrations run automatically at server boot (transactional, history-tracked).
The game server drains gracefully on restart: readiness flips false → rooms
notified → stats flushed → exit (spec §73). MVP tolerates the seconds-long
restart window; multi-instance rolling deploys are the documented growth path
(spec §72) — Colyseus supports horizontal scale-out with a Redis presence +
seat-reservation driver when needed.

## Required .env (production)

`SITE_ADDRESS` (domain), `POSTGRES_PASSWORD`, `SESSION_SECRET`
(`openssl rand -hex 32` each), optional `LOG_LEVEL`. Never commit `.env`.

## Rollback (spec §121)

```bash
git checkout <previous-tag>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl -sf https://$DOMAIN/health
```
- Application images are rebuilt from the tagged source (deterministic).
- Migrations are additive-only by policy; a release whose migration must be
  reverted ships a compensating `NNN_revert_*.sql` file instead of editing
  history. Data-destroying mistakes → restore from backup (docs/BACKUPS.md),
  accepting loss back to the last snapshot.

## Nginx alternative

Caddy is the supported proxy (ADR-003). An equivalent nginx config needs:
TLS certs (certbot), `proxy_set_header Upgrade/Connection` for `/ws/`,
`proxy_read_timeout 3600s`, gzip, and the same routes — see Caddyfile as the
source of routing truth.
