# MONITORING

## Endpoints

- `GET /health` — liveness: uptime, room count, players (public via proxy).
- `GET /ready` — readiness; 503 while draining (proxy stops routing).
- `GET /version` — server + protocol + node versions.
- `GET /metrics` — full monitor (spec §50): CPU%, RSS/heap, event-loop lag
  (current/max), per-room players/worms/food/tick avg+max. **Not routed
  through Caddy** — internal only; reach it via
  `docker compose exec game-server node -e "fetch('http://localhost:2567/metrics').then(r=>r.text()).then(console.log)"`
  or an SSH tunnel. Exposing it publicly requires auth (spec §92).

## Client side (spec §49)

Settings → "Show debug info": FPS, frame time, entity counts, ping/jitter,
server tick, prediction error, input queue, versions. Network-quality dot is
always visible (spec §108 thresholds in config NET.quality).

## Host watchdog

`scripts/healthwatch.sh` (cron */5): health/ready endpoints, pg_isready,
redis PING, disk thresholds 70/85/95% (spec §124). Non-zero exit hooks into
cron mail or any alerting you attach.

## Logs

Structured JSON (pino) on stdout → docker json-file, rotated 10 MB × 5 per
service (spec §123). Lifecycle events double as analytics (spec §90):
player_join/leave/drop/reconnect, death, room_create/dispose (with tick
stats), input_rejections, client_error, db/redis status events. Query:
`docker compose logs game-server | grep '"event":"death"'`.

## Growth path

The /metrics JSON is one adapter away from Prometheus if/when a Grafana stack
is wanted; not shipped by default to keep the VPS footprint minimal.
