# TASKS — progress ledger

Rule: a task is checked ONLY after verification (typecheck + tests + runtime
check), never merely because code exists. See CLAUDE.md.

## Milestone M0 — Foundation (spec phases 0–2)

- [x] Git repo initialized (main), directory skeleton per spec §5
- [x] Root workspace: package.json, pnpm-workspace.yaml, .gitignore, .env.example
- [x] CLAUDE.md project rules
- [x] docs/MASTER_SPEC.md preserved
- [x] docs/ skeleton (all §7 files) with initial content
- [x] packages/config — balance + game configuration (single source of tuning)
- [x] packages/shared — math, seeded RNG, utils (unit-tested)
- [x] packages/protocol — versioned message/snapshot types
- [x] packages/game-core — deterministic sim scaffold (fixed timestep, unit-tested)
- [x] packages/asset-types — manifest types
- [x] apps/server — Colyseus boot, /health /ready /version
- [x] apps/client — Vite + Phaser boot, home screen shell
- [x] apps/bot — headless client scaffold
- [x] tools/asset-pipeline — SVG→PNG→atlas build scaffold
- [x] scripts/quality-gate.sh green: install → typecheck → test → build
- [x] Initial commit + push to GitHub (from user's PC)

## Milestone M1 — Multiplayer vertical slice (phases 3–10)

- [x] Client shell: home → PLAY → arena scene
- [x] Colyseus ArenaRoom, 60 Hz fixed sim loop
- [x] Deterministic movement (turn-rate bounded) in game-core
- [x] Path-based worm body (mass → length)
- [x] Client prediction + server reconciliation
- [x] Remote snapshot interpolation
- [x] Food: pooled spawn/pickup/growth
- [x] Boost (energy/mass drain, server-validated)
- [x] Collision (spatial hash + circle/capsule) → death → death loot
- [x] Leaderboard (top N + own rank)
- [x] Camera follow + size-based zoom
- [x] E2E: two Playwright clients play; latency 100–200 ms test
- [ ] Synced to user's PC + pushed

## Milestone M2 — Product feel (phases 11–15)

- [x] Powerup effect system (SPEED, MAGNET, DOUBLE_GROWTH, SHIELD, …)
- [x] Full original art integrated (no placeholders) + ART_STYLE.md
- [x] UI design system, HUD, death screen, settings, loading screen
- [x] Mobile: virtual joystick, boost button, safe areas, orientation
- [x] Audio manager + original SFX/music + AUDIO_STYLE.md
- [x] Reconnect flow (token, grace window, restore) + E2E

## Milestone M3 — Hardening & scale (phases 16–23)

- [x] Anti-cheat validation suite + tests
- [x] Interest management (spatial cells / AOI)
- [x] Bot framework behaviors
- [x] Load tests 10→200 with recorded metrics → LOAD_TESTING.md
- [x] Network condition test modes (latency via ?fakeLag; loss/jitter deferred to M5 VPS validation)
- [x] Client + server perf monitors
- [x] PostgreSQL migrations + guest profiles + async batched stats
- [x] Redis rate limiting

## Milestone M4 — Production packaging (phases 24–29)

- [x] Landing page, legal placeholders, PWA manifest
- [x] Multi-stage Dockerfiles (non-root, healthchecks, graceful shutdown)
- [x] docker-compose: client/server/postgres/redis/caddy
- [x] Backups, log rotation, monitoring config
- [x] Staging compose variant
- [x] Deploy + rollback runbooks
- [x] Verified on user's PC: compose up → all containers healthy → ws-smoke (matchmaking+WS+handshake) through Caddy → PWA/legal pages served → bot matches persisting to containerized Postgres

## Feedback rounds (post-M4 user QA)

- [x] Round 1: render interpolation (judder), browser-zoom fairness + guards, wormate-style food/effect art, ZOOM powerup
- [x] Round 2: input-rate blackout fix (the real ~1s bump), premium art v2, cache-correct asset URLs
- [x] Round 3: PathTracker tail fix (coiling), resident AI bots playing + ranked, world 18000, square minimap, invite links (?join), global top-10 on home — 23/23 E2E, quality gate green
- [x] Round 4: staggered 50-bot population, random bot names every spawn, encircle-squeeze physics + 2 regression tests, global top-10 as right-side panel — 32 unit + 23 E2E green, quality gate green
- [x] Round 5: radius-scaled body spacing (giant worms stay snug), wormate squeeze pacing (floor 2.2, never <2s kill, hold-then-close proven in test), trapped-bot circling behavior, bots live until killed (rotation removed) — 32 unit + 23 E2E green, quality gate green

## Milestone M5 — VPS release (phases 30–32)

- [ ] VPS provisioning + DNS + UFW (user's VPS + domain)
- [ ] HTTPS/WSS live, smoke test from two networks
- [ ] Final checklist (spec §127) sign-off
