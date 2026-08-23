# TROUBLESHOOTING

**Game won't load (browser)** — check https://domain/health. 502 → game-server
down: `docker compose ps`, `docker compose logs game-server`. TLS errors →
DNS not pointing at the VPS or port 80/443 blocked (Caddy needs both for
issuance).

**"Could not reach the game server" on PLAY** — WS proxy path: verify
`curl -sf https://domain/ws/matchmake/joinOrCreate/arena -X POST -H 'content-type: application/json' -d '{}'`
returns JSON (even an error JSON = routing works). If HTML comes back, the
Caddyfile /ws route is missing.

**Players lag/rubber-band** — `/metrics`: tickAvgMs > 8 or eventLoopLagMs
high → CPU starved (co-tenants? undersized VPS). Check `docker stats`.

**Reconnect loop** — server restarted mid-session (expected: clients rejoin
fresh after grace) or Redis/DB blocking boot? Both are optional: server runs
without them; check `db_unreachable`/`redis_unreachable` warnings.

**Postgres unhealthy** — `docker compose logs postgres`; disk full is the
usual cause (spec §124). Free space, `docker compose restart postgres`.

**Stats not persisting** — grep logs for `persist_flush_failed`; verify
DATABASE_URL matches the postgres service env; confirm `db_ready` at boot.

**Migration failed at boot** — server exits? No: it logs and disables
persistence. Fix the SQL in a NEW migration file; never edit applied ones.

**High input_rejections warnings** — a client flooding or a broken client
build; identify the session id in the log; not an outage.

**Container name conflicts after config edits** — `docker compose down`
(volumes survive) then `up -d`.

**Where is everything?** — code /opt/nibblio; data in named volumes
(`docker volume ls | grep nibblio`); backups ./backups; logs via
`docker compose logs`.
