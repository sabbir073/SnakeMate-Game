# MASTER SPEC — A-to-Z Autonomous Development Specification

Production Browser Multiplayer Worm Arena ("Nibblio").
This file preserves the client-provided specification of 2026-08-23 in full.
It is the project's authoritative requirements document.

## 0. ROLE

Act as the complete engineering team (product architecture, game design, multiplayer
networking, gameplay, frontend, backend, rendering, UI/UX, asset pipeline, audio,
performance, security, anti-cheat, automated testing, browser compatibility, mobile
optimization, DevOps, Docker, Linux administration, VPS deployment, reverse proxy,
HTTPS, monitoring, logging, backup strategy, production documentation).
Actually build, execute, test, debug, optimize and deploy. Not a prototype — a
deployable production system.

## 1. PRODUCT VISION

Original browser-based real-time multiplayer worm arena inspired by the genre of
wormate-style games. Deliver: instant browser play, no installation, desktop +
mobile support, fast matchmaking, smooth multiplayer, colorful original visuals,
continuous movement, food collection, worm growth, boost mechanics, worm-vs-worm
collisions, death loot, power-ups, leaderboard, skins, responsive controls,
reconnect support, low-latency gameplay, production-grade backend. Must feel like a
real commercial game.

## 2. LEGAL / CREATIVE RULE

Genre inspiration only. DO NOT copy Wormate source code, artwork, textures, sounds,
UI, logo, name, character designs, skins, or proprietary assets. Create original:
game name, logo, worms, food, arena, UI, icons, particles, sounds, music, skins,
fonts where necessary, branding. Objective: GAMEPLAY PARITY, not ASSET COPYING.

## 3. PRIMARY SUCCESS CRITERIA

1. Opens in a modern browser. 2. Loads quickly. 3. Enter arena with minimal
friction. 4. Local worm reacts immediately. 5. Other worms appear smooth. 6. Food
collection feels responsive. 7. Growth is visually satisfying. 8. Boost feels
powerful. 9. Collisions are deterministic. 10. Death is reliable. 11. Leaderboards
are accurate. 12. Mobile controls usable. 13. Reconnection works. 14. Server-side
anti-cheat rules exist. 15. Production deployment works on a VPS. 16. HTTPS works.
17. WebSockets work through the reverse proxy. 18. Server restart behavior is
controlled. 19. Database backup configured. 20. Logs + health monitoring exist.
21. Automated tests pass. 22. Load/stress testing performed. 23. Performance
metrics measurable. 24. No known critical runtime errors.

## 4. TECHNOLOGY STACK

Client: TypeScript, Phaser 3, Vite, HTML5, CSS, WebGL, Web Audio API, Colyseus
client. Server: Node.js, TypeScript, Colyseus, WebSocket, Fastify/lightweight HTTP
where useful. Database: PostgreSQL. Cache/infra: Redis. Testing: Vitest,
Playwright, custom load/bot clients. Package manager: pnpm workspace/monorepo.
Infrastructure: Docker, Docker Compose, Nginx or Caddy, Ubuntu/Debian VPS, HTTPS
via Let's Encrypt.

## 5. MONOREPO

apps/{client,server,bot}; packages/{shared,game-core,protocol,config,asset-types};
assets/{source,generated,processed,atlases,audio,fonts};
tools/{asset-pipeline,map-generator,bot-runner,profiling,deployment}; docs/;
docker/; scripts/; root package.json, pnpm-workspace.yaml, docker-compose.yml,
.env.example, .gitignore, CLAUDE.md, README.md.

## 6. CLAUDE.md

Root CLAUDE.md with permanent project rules: purpose, architecture, package
manager, commands, coding standards, testing rules, security rules, performance
rules, asset-generation rules, deployment rules, Git rules.

## 7. DOCUMENTATION STRUCTURE

docs/: ARCHITECTURE, PRODUCT, GAMEPLAY, NETWORKING, SERVER_SIMULATION,
CLIENT_RENDERING, MOBILE, ART_PIPELINE, AUDIO, PERFORMANCE, SECURITY, ANTI_CHEAT,
DATABASE, API, TESTING, LOAD_TESTING, DEPLOYMENT, DOCKER, VPS, MONITORING,
BACKUPS, OPERATIONS, RELEASES, TROUBLESHOOTING, TASKS, CHANGELOG (all .md).
Every major architectural decision must be documented.

## 8. DEVELOPMENT METHODOLOGY

Vertical slices. Per feature: design → implement → typecheck → unit test → run
locally → browser test → multiplayer test if applicable → profile if
performance-sensitive → document → mark complete. Never mark complete merely
because source code exists.

## 9. REQUIRED DEVELOPMENT LOOP

READ → PLAN → IMPLEMENT → RUN → TEST → OBSERVE → DEBUG → VERIFY → DOCUMENT.
On failure: read the actual error, diagnose root cause, fix, re-run. Never hide
errors.

## 10. GIT STRATEGY

main, development, feature branches. Meaningful conventional commits
(feat/perf/chore/...). No meaningless giant commits.

## 11. GAME DESIGN — CORE LOOP

JOIN MATCH → SPAWN → MOVE → COLLECT FOOD → GROW → BOOST → HUNT/ESCAPE → COLLIDE →
WIN OR DIE → COLLECT DEATH LOOT → SCORE/RANK → PLAY AGAIN. Make this fun before
secondary systems.

## 12. PLAYER EXPERIENCE

Frictionless first session. Home: logo, nickname field, PLAY, skin/customization,
settings, optional account button. PLAY → Connecting… → Searching… → Joining
arena… → gameplay. No forced account creation.

## 13. GAMEPLAY MECHANICS

Continuous movement, steering, acceleration/boost, food, mass, growth, worm body,
enemy collision, death, death loot, leaderboard, power-ups, cosmetics. All
balancing values centralized in configuration.

## 14. WORM MODEL

Worm { id, ownerId, x, y, angle, speed, targetAngle, radius, mass, score,
boostEnergy, alive, spawnTime, skinId, bodyPath, powerUpState }. Body is
path-based; segments are NOT independent networked entities.

## 15. WORM BODY

Body derives from sampled movement path; head moves, body follows historical
positions with controlled sample spacing. Length follows mass. Remote clients
reconstruct the body from synchronized state/path info — never send every segment.

## 16. MOVEMENT

Deterministic enough for client prediction. Fixed timestep; direction vector,
speed, acceleration, turn-rate limit. angle += boundedTurn(inputAngle − angle);
velocity = dir(angle)×speed; position += velocity×dt. No client-defined positions.

## 17. BOOST

Increases speed; visual + audio feedback; consumes energy/mass; server-validated;
does not make movement uncontrollable.

## 18. FOOD

Types: COMMON, RARE, EPIC, BONUS, DEATH_LOOT. Each has value, visual, scale, spawn
behavior, collection radius. Use object pools.

## 19. POWERUPS

Generic effect system: SPEED, MAGNET, DOUBLE_GROWTH, SHIELD, BOOST_REDUCTION,
SCORE_MULTIPLIER. Each: id, duration, spawnWeight, effect, visual, sound, server
behavior, UI icon.

## 20. COLLISION SYSTEM

Broad phase: spatial hash/grid. Narrow phase: distance/circle/capsule. Never scan
every segment against every enemy; cost ∝ nearby candidates.

## 21. WORLD

100000×100000 (configurable). Contains background, decorations, food, powerups,
worms, optional special zones. Camera follows local worm.

## 22. WORLD GENERATION

Procedural decorative background (patterns, clouds, candy elements, confetti,
props) — deterministic and cheap. Gameplay entities remain server-authoritative.

## 23. CAMERA

Follows local player, smooths motion, optional size-based zoom, configurable
limits, no visible jitter. Render-side only.

## 24. MULTIPLAYER ARCHITECTURE

Authoritative Colyseus rooms (rooms, matchmaking, state sync, scaling paths).

## 25. SERVER SIMULATION

60 Hz fixed simulation; network publishing independent (start 20–30 updates/sec);
client renders 60 FPS+ where possible. Fixed tickrate + prediction + interpolation
model.

## 26. CLIENT PREDICTION

Input → immediate local sim → render → send input → receive authoritative state →
reconcile → replay unacknowledged inputs. Must work at 50/100/150/200/300 ms.

## 27. REMOTE INTERPOLATION

Keep previous + current snapshot; render between them. No packet-to-packet jumps.

## 28. NETWORK INPUT

Send intentions only: { sequence, angle, boost }. Never x/y/score/mass/kill —
server-owned.

## 29. NETWORK UPDATE STRATEGY

Separate simulation/render/network state. Snapshot updates, compact state, changed
entities where useful, area-of-interest filtering.

## 30. INTEREST MANAGEMENT

Partition world into cells; per client send only nearby worms, food, powerups,
important effects.

## 31. PLAYER STATE

Persist eventually: player ID, nickname, skin, statistics, coins, unlocks,
settings. PostgreSQL is never in the realtime loop.

## 32. REDIS

Matchmaking metadata, presence, rate limiting, temp session data, distributed
coordination, optional leaderboard caching. Not a second authoritative state.

## 33. POSTGRESQL

Tables: users, guest_profiles, player_profiles, skins, skin_unlocks, matches,
match_results, player_statistics, achievements, settings, purchases, audit_events.
Proper indexes; migrations; no manual production schema mutation.

## 34. API

HTTP: health, readiness, version, player profile, authentication, cosmetics,
statistics, admin/diagnostics. Realtime stays WebSocket/Colyseus.

## 35. AUTHENTICATION

MVP: guest identity. Future: email/social; support linking guest → permanent.
Never a blocker to first play.

## 36. UI SYSTEM

Design system: colors, spacing, typography, buttons, cards, panels, icons, modals,
toasts, mobile controls, HUD, leaderboard, death screen, settings, loading screen.

## 37. GRAPHICS REQUIREMENT

Every game visual deliberately created. No placeholder rectangles/emojis/stock
icons/missing art in final build. Original: logo, favicon, background, worm
head/body/tail, eyes, food, powerups, UI icons, buttons, leaderboard symbols,
death/boost/collect effects, skin thumbnails, menu backgrounds, loading screen,
decorative elements.

## 38. ART PIPELINE

assets/{source,generated,processed,atlases}. Each generated asset: source prompt,
generation date, purpose, dimensions, format, license metadata. docs/ART_PIPELINE.md.

## 39. GRAPHICS STYLE

High-quality cartoon; bright colors; clean silhouettes; mobile-readable; strong
contrast; playful fantasy/candy theme. Soft rounded geometry, bold outlines,
subtle gradients, small highlights, light shadows, sparkles, juicy feedback.
Avoid perf-harming detail.

## 40. ASSET DIMENSIONS

Source masters high-res (logo 2048+, worm head 512, food 128–256, UI icons
64–256); runtime optimized (logo 512–1024). Don't ship huge sources.

## 41. TEXTURES

Atlases grouping food/powerups/UI icons/worm parts/effects; atlas build tooling;
PNG/WebP/AVIF by support + transparency needs.

## 42. PROCEDURAL GRAPHICS

Sparkles, rings, glows, trails, impact bursts, collection effects — procedural
where possible.

## 43. ANIMATION

Idle head motion, eye movement, boost, food collection, powerup pickup, death,
spawn, leaderboard/menu transitions. Sparingly; readability first.

## 44. AUDIO

Original: background music, UI click, food pickup (small/large), boost, powerup,
collision, death, rank-up, spawn. Compressed formats. Master/music/SFX volume,
mute, mobile audio init behavior.

## 45. AUDIO PERFORMANCE

Controlled audio manager; prevent sound spam (throttle/combine similar sounds).

## 46. MOBILE UX

Android Chrome, iOS Safari, desktop Chrome/Edge/Firefox/Safari. Test 360×800,
390×844, 412×915, 768×1024, 1920×1080, 2560×1440.

## 47. MOBILE CONTROL

Virtual joystick, boost button, optional alternative touch steering. Large,
responsive, non-overlapping, safe-area aware (notch, dynamic island, browser UI,
orientation).

## 48. PERFORMANCE BUDGETS

60 FPS target / 30 FPS fallback. Server 60 Hz: 16.67 ms budget; preferred avg
< 8 ms; heavy 10–12 ms; critical 16 ms sustained. Measure, don't assume.

## 49. CLIENT PERFORMANCE MONITOR

Dev panel: FPS, frame time, memory, draw calls, visible/total entities, latency,
jitter, server tick, interpolation delay, prediction error, input queue length.

## 50. SERVER PERFORMANCE MONITOR

Room count, players online/per room, tick duration (avg/max), WS connections,
CPU, RAM, event-loop lag, network bytes, GC, DB latency, Redis latency.

## 51. BOT FRAMEWORK

apps/bot: wander, seek food, avoid hazards, boost randomly, approach players,
escape, occasionally collide, die, respawn. Useful for load testing.

## 52. LOAD TESTING

Profiles: 10/25/50/75/100/150/200 clients. No capacity claims until tested.
Record CPU, RAM, tick duration, bandwidth, packet rate, errors, disconnects,
average latency.

## 53. NETWORK SIMULATION

Test modes: 0/50/100/150/200/300 ms latency; 1/3/5/10% loss; 10/30/80 ms jitter.

## 54. ANTI-CHEAT

Server validation: max movement speed, turn speed, boost rate, mass transitions,
food/powerup pickup distance, spawn rules, collision, death, score, leaderboard,
message rates. Never punish high latency alone.

## 55. SECURITY

Protect HTTP endpoints, WebSockets, DB/Redis credentials, env secrets, admin
endpoints, sensitive logs. Never expose DATABASE_URL/REDIS_URL/keys/JWT secrets.
Never commit .env.

## 56. RATE LIMITING

Login, nickname changes, room creation, HTTP APIs, WS messages, admin actions.
Redis for distributed limiting.

## 57. ERROR HANDLING

Client: friendly reconnect UI. Server: structured logs. HTTP: correct status
codes. DB: retry where appropriate. Realtime: disconnect/reconnect handling.
Never silently swallow errors.

## 58. OBSERVABILITY

Structured JSON logs, health/readiness endpoints, metrics, error tracking hooks,
room + player lifecycle logs, performance metrics.

## 59. HEALTH ENDPOINTS

GET /health, /ready, /version. Health verifies server + essential dependencies;
readiness fails when traffic shouldn't arrive.

## 60. DOCKER DEVELOPMENT

Dockerfiles for client, server, bot tools as needed; docker-compose.yml with
client, server, postgres, redis, nginx/caddy. Reproducible development.

## 61. PRODUCTION CONTAINERS

Multi-stage builds, minimal runtime images, non-root users, health checks, env
injection, read-only FS where practical, proper signal handling.

## 62. VPS TARGET

Ubuntu 24.04 LTS (or current LTS); typical 4–8 vCPU, 8–16 GB RAM, NVMe. No
hard-coded resource assumptions.

## 63. TOPOLOGY

Internet → DNS → VPS → Caddy/Nginx → (HTTPS static site; WebSocket/API) → game
server → Redis + PostgreSQL.

## 64. REVERSE PROXY

HTTPS, HTTP/2, WS upgrade, compression, security headers, static caching, API
routing, health routing, timeouts, keep WS alive.

## 65–66. DOMAIN & FIREWALL

Document DNS A/AAAA, firewall, ports 22/80/443 only public. UFW; never expose
Postgres/Redis/Colyseus internals/Docker services publicly.

## 67. SSL

Let's Encrypt with auto-renewal. Verify HTTPS, WSS, no mixed content, renewal.

## 68. PRODUCTION ENVIRONMENT

.env.example (never real secrets): NODE_ENV, PORT, DATABASE_URL, REDIS_URL,
PUBLIC_URL, CLIENT_URL, SESSION_SECRET, JWT_SECRET, SENTRY_DSN, etc.

## 69. MIGRATIONS

Proper migration tool; dev → test → staging → production. Never casual live
schema changes.

## 70. BACKUPS

Automated daily PostgreSQL backups, multi-day retention, periodic restore tests.
Document location, restore command, procedure.

## 71–73. DEPLOY/SHUTDOWN

Deploy: pull/build → migrate → health check → graceful restart → verify →
rollback path. Architecture permits multi-instance/rolling/zero-downtime later.
Graceful shutdown: stop intake → notify rooms → grace period → persist → close.

## 74. RECONNECTION

Session token, reconnect window, room reconnection, temporary disconnect state,
client reconnect screen, state restoration.

## 75. DOMAINS

Consistent domain strategy (www/play + api + ws subdomains as appropriate).

## 76. PWA

Manifest, icons, theme, installability, offline shell for static assets. Never
pretend multiplayer is offline-capable.

## 77–78. LANDING + LEGAL

Lightweight landing: logo, PLAY NOW, description, screenshots, how to play,
features, privacy, terms, support. Legal pages with placeholders where
jurisdiction-specific wording requires a lawyer.

## 79. ACCESSIBILITY

Keyboard controls, visible focus states, contrast, text scaling, reduced motion,
sound toggle, clear button states — without compromising responsiveness.

## 80. SETTINGS

Music, SFX, quality, language (later), control scheme, reduced motion, FPS/debug.

## 81–82. ECONOMY & SKINS

Foundation for coins/skins/rarity/unlocks/inventory/reward history; no pay-to-win.
Data-driven Skin {id,name,rarity,headAsset,bodyAsset,tailAsset,thumbnail,
unlockType}; rendering ignorant of purchase rules.

## 83–85. CONTENT PIPELINE / LOADING / CACHE

assets-manifest.json (id, type, path, dimensions, version, preload group,
metadata). Load core → gameplay → cosmetics. Cache hashed statics aggressively;
never cache dynamic gameplay state.

## 86–88. VERSIONING

Client + server + protocol versions exposed (GET /version, debug panel).
protocolVersion guards incompatible releases; graceful rejection of unsupported
versions.

## 89–91. TELEMETRY / ANALYTICS / STATS

Client errors: type, version, browser, OS, device class. Analytics events
(game_start, match_join/leave, food_collected, boost_started, powerup_collected,
kill, death, session_duration, reconnect, disconnect) — not per tick. Player
statistics batched asynchronously to PostgreSQL.

## 92. ADMIN

Optional authenticated diagnostics: rooms, players, CPU, tick time, memory,
version, recent errors.

## 93. COMMANDS

pnpm install/dev/build/test/lint/typecheck/format/test:e2e/test:load/
asset:build/docker:up/docker:down/deploy.

## 94. QUALITY GATE

Before release: typecheck, unit, E2E, build, asset validation, Docker builds,
health, WS connectivity, migrations, smoke test. No ignored critical
vulnerabilities without documented justification.

## 95–96. E2E

Playwright: homepage, play button, nickname, game load, server connection, food,
death screen, replay, settings, mobile + desktop viewports, reconnect flow.
Multiplayer: ≥2 clients — join, movement, visibility, food, growth, collision,
death, leaderboard, disconnect, reconnect.

## 97–98. ART VALIDATION & PERF CI

Validate missing/wrong-path/unsupported/oversized/unatlased/unused/duplicate
assets. Lightweight perf CI: bundle size, asset size, server startup, basic room
sim, regression thresholds.

## 99. BUNDLE OPTIMIZATION

Code splitting, lazy loading, tree shaking, compression, hashed filenames,
preload core only. No dev tooling in production bundles.

## 100–102. MEMORY/TIMERS/POOLING

Monitor room/player/food/reconnect cleanup, timers, listeners, WS cleanup. Prefer
simulation scheduler + expiration timestamps over thousands of timers. Pool food,
particles, effects, segment buffers.

## 103. SPATIAL INDEX

insert/remove/update/queryRadius/queryAABB/clear; benchmarked; used for
collision, food, powerups, nearby queries.

## 104–106. PROFILING

Network: msgs in/out per sec, bytes/sec, payload sizes, per-player usage. Server:
CPU/allocation hotspots, GC, collision/serialization/network cost. Client: main
thread, rendering, GPU, JS, GC, input latency, decode, network processing.

## 107. LOW-END MODE

Reduce particles/decorations/glows/effects/animations/background complexity;
NEVER collision correctness, control responsiveness, multiplayer state.

## 108. NETWORK QUALITY INDICATOR

Excellent/Good/Poor/Reconnecting from ping/jitter thresholds; never shame normal
mobile variation.

## 109–110. MATCHMAKING & ROOMS

25–50 player target rooms (configurable); no untested capacity claims. Future:
latency-aware, region, skill. Room states CREATED/WAITING/ACTIVE/ENDING/DISPOSED;
dispose empty after delay; spawn new room near capacity.

## 111–114. SPAWN / LOOT / LEADERBOARD / SCORE

Safe spawn distance + food nearby, no spawn kills. Death drops % of mass as
attracting food. Leaderboard top 10–20 + own rank. Centralized configurable score
formulas.

## 115–118. BALANCE / FLAGS / CHANNELS

Central balance file (movement, turning, boost, mass, food, powerups, spawn
rates, room limits, camera zoom, collision radius). Dev runtime overrides;
production controlled config. Feature flags for rollout-sensitive features only.
Channels: development/staging/production.

## 119–126. STAGING / DEPLOY SCRIPT / ROLLBACK / MONITORING / OPS

Staging with separate DB/Redis/domain/secrets. Documented deploy: pull → validate
env → migrate → verify build → restart → health → WS check → smoke → rollback
path. Rollback docs (app, image, migrations, DB restore). VPS monitoring (CPU,
RAM, disk, load, service/DB/Redis/game health). Log rotation. Disk alerts at
70/85/95%. DB maintenance docs. Security update cadence + credential rotation +
backup verification.

## 127. FINAL PRODUCTION CHECKLIST

frontend build · server build · tests · E2E · assets complete · no placeholder
art · original logo · original skins · mobile UI · desktop controls · multiplayer
· prediction · interpolation · collision · leaderboard · powerups · reconnect ·
anti-cheat · Docker builds · PostgreSQL · Redis · reverse proxy · HTTPS · WSS ·
health endpoint · backups · monitoring · log rotation · production smoke test ·
rollback documented.

## 128–133. EXECUTION RULES

Autonomous within phase; never destroy working functionality, hide failures, skip
tests, or claim unverified success. Ambiguity: safest reasonable decision; ask
only for material product/cost/security/architecture/irreversible/legal changes.
Bugs: reproduce → isolate → understand → fix → test → regression test. Perf:
measure first, optimize the bottleneck. Multiplayer bugs: capture logs/state/
sequence/latency, reproduce deterministically. Missing assets: generate via
pipeline, never placeholder.

## 134–140. ART & AUDIO WORKFLOW

graphics/prompts/ manifests per category; per asset: art direction → generate →
select → clean → crop/resize → convert → atlas → manifest → integrate → test at
gameplay size. Inspect seams/transparency/outlines/lighting/shapes/typography/
compression/mobile readability. Generated UI art, but dynamic text stays
HTML/Canvas + web fonts. Logo set: horizontal, square icon, favicon, social
preview, loading. docs/ART_STYLE.md + docs/AUDIO_STYLE.md style bibles.

## 141–145. POLISH, ACCEPTANCE, DELIVERABLES

Final passes: game feel, animation, audio, UX, mobile, performance,
accessibility, network, security, deployment. Acceptance test: two browsers play
a full loop locally, then the SAME repo deploys to a clean VPS via docker compose
+ DNS + HTTPS and two unrelated networks play. Deliverables: source, tests,
assets, manifests, docs, Docker, deploy scripts, env example, migrations,
monitoring, backups, perf tools, bot load tests, README, CLAUDE.md, TASKS.md.
Definition of done: "A real person can open this URL and have a smooth
multiplayer game."

## 146. EXECUTION ORDER (PHASES 0–32)

0 bootstrap · 1 architecture/docs · 2 asset pipeline · 3 frontend foundation ·
4 authoritative multiplayer prototype · 5 prediction/interpolation · 6 worm sim ·
7 food/growth · 8 collision/death · 9 leaderboard · 10 boost · 11 powerups ·
12 visual polish · 13 mobile controls · 14 audio · 15 reconnect · 16 anti-cheat ·
17 spatial optimization · 18 interest management · 19 bot framework · 20 load
testing · 21 client perf · 22 server perf · 23 database/persistence · 24 landing/
PWA · 25 Docker · 26 VPS deployment · 27 HTTPS/WSS · 28 monitoring/backups ·
29 staging · 30 production validation · 31 final polish · 32 release.

## 147–150. OPERATING PROMPTS

Lead-engineer behavior: inspect state before changing; smallest coherent change;
verify everything; preserve runnable state; maintain product/gameplay/network/
graphics/performance/security/QA/devops/writer roles simultaneously. End state: a
complete, testable, documented, deployable production game.
