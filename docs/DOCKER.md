# DOCKER

## Images

- **game-server** (`docker/server.Dockerfile`): node:22-alpine multi-stage —
  pnpm install → esbuild bundle → `pnpm deploy` prod node_modules → runtime
  with dist + migrations, non-root `node` user, fetch-based HEALTHCHECK,
  SIGTERM-graceful (drains stats, closes rooms). ~180 MB.
- **web** (`docker/web.Dockerfile`): vite build → caddy:2-alpine with the
  static bundle + `docker/Caddyfile` (TLS, WS proxy, caching, headers).

## Compose stacks

- `docker-compose.yml` — local/full stack: game-server (internal :2567), web
  (:8080→80), postgres:17-alpine, redis:8-alpine; healthchecked; log rotation
  10 MB × 5 per service; named volumes.
- `+ docker-compose.prod.yml` — 80/443(+udp) published, SITE_ADDRESS +
  SESSION_SECRET required (auto-TLS via Caddy).
- `+ docker-compose.staging.yml` — separate project/ports/volumes (spec §119).

## Commands

```bash
docker compose up -d --build      # build + run everything
docker compose ps                 # status/health
docker compose logs -f game-server
docker compose down               # stop (volumes preserved)
docker compose down -v            # stop AND wipe data (careful)
```

Verified: full stack build + health + bot gameplay through Caddy + Postgres
persistence on Docker Desktop (Windows) 2026-08-23.
