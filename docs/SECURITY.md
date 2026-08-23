# SECURITY

## Surface & controls

| Surface | Control |
|---|---|
| WebSocket inputs | InputGuard validation (docs/ANTI_CHEAT.md); intentions-only protocol — no client-settable state |
| Matchmaking | per-IP join rate limit 20/min (Redis-backed, spec §56) |
| HTTP API | tiny surface (health/ready/version/client-error); client-error rate-limited 10/min/IP + 4 KB body cap |
| Admin data | /metrics NOT routed through the proxy — internal only (spec §92) |
| Postgres/Redis | never published; compose-internal network only (spec §66) |
| VPS | UFW allows 22/80/443 only; non-root deploy user; monthly patching |
| Containers | non-root runtime user, minimal alpine images, healthchecks, init signal handling |
| Transport | HTTPS + WSS via Caddy/Let's Encrypt; HTTP→HTTPS redirect; security headers (nosniff, frame-deny, referrer-policy) |
| Secrets | .env only (gitignored); .env.example documents names; `openssl rand -hex 32` for SESSION_SECRET; rotation quarterly (OPERATIONS.md) |
| XSS | all player-supplied text (nicknames) HTML-escaped in the DOM HUD; control chars stripped server-side |
| Logs | no secrets logged; client-error payloads truncated + rate-limited |

## Dependency policy (spec §94)

`pnpm audit` reviewed at each release; criticals block release unless a
written justification lands in RELEASES.md.

## Reporting

Security contact placeholder — the operator should publish an email/security.txt
before public launch.
