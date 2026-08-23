# CLAUDE.md — Nibblio permanent project rules

## Project purpose

Nibblio is an original, production-grade, browser-based real-time multiplayer worm
arena (genre-inspired by wormate-style games; **zero copied assets/code/branding**).
The authoritative specification is `docs/MASTER_SPEC.md`. Progress ledger is
`docs/TASKS.md`. Definition of done: a real person opens the public URL and has a
smooth multiplayer game.

## Architecture (do not casually rewrite)

- pnpm monorepo. `apps/client` (Phaser 3 + Vite + TS), `apps/server`
  (Node + Colyseus + TS), `apps/bot` (headless load/test clients).
- **`packages/game-core` is the heart**: pure, deterministic, side-effect-free
  simulation (movement, worm path/body, food, collision, boost, powerups, scoring)
  with a fixed 60 Hz timestep. Server runs it authoritatively; client runs the SAME
  code for prediction; tests run it headlessly. Never fork simulation logic into
  client- or server-only copies.
- `packages/protocol`: versioned message + snapshot types (`PROTOCOL_VERSION`).
  Client sends **intentions only** (`{seq, angle, boost}`) — never position/mass/score.
- `packages/config`: ALL balance/tuning values. No magic gameplay numbers in code.
- `packages/shared`: math, RNG (seeded), utils. `packages/asset-types`: manifest types.
- PostgreSQL = durable data via migrations only (never in the realtime loop;
  batched async writes). Redis = rate limiting, presence, matchmaking metadata,
  leaderboard cache — never a second authoritative game state.
- Networking: 60 Hz simulation, ~20 Hz snapshots, client prediction +
  reconciliation, snapshot interpolation for remote entities, area-of-interest
  filtering via spatial cells.

## Package manager & commands

pnpm only (no npm/yarn). Key commands from repo root:
`pnpm dev` · `pnpm build` · `pnpm test` · `pnpm typecheck` · `pnpm lint` ·
`pnpm test:e2e` · `pnpm test:load` · `pnpm asset:build` · `pnpm gate`
(quality gate: typecheck → unit tests → build) · `pnpm docker:up` / `docker:down`.

## Coding standards

- TypeScript strict mode everywhere. No `any` unless justified with a comment.
- game-core: no `Date.now()`, no `Math.random()` — inject time/RNG (determinism).
- Object pools for food/particles/segments; no per-frame allocation storms.
- Never model worm body segments as independent networked entities — body derives
  from the sampled head path.
- Collision: spatial-hash broad phase + circle/capsule narrow phase. Never O(n²)
  over all segments.
- Errors are never silently swallowed. Structured JSON logs on the server.

## Testing rules

- A feature is NOT complete because code exists. It is complete when: typecheck
  passes, unit tests pass, it runs in a browser, and (if multiplayer) it has been
  exercised with ≥2 clients. Update `docs/TASKS.md` only after verification.
- Determinism tests: same inputs ⇒ same game-core state hash.
- Playwright E2E lives in `apps/client/e2e`; bot load harness in `apps/bot`.
- Never claim a player-count capacity that has not been load-tested (§52).

## Security rules

- Server validates everything: speed, turn rate, boost, pickup distance, mass
  transitions, message rates. Client input is untrusted by definition.
- Never commit `.env` / secrets. `.env.example` documents required variables.
- Postgres/Redis/Colyseus internal ports are never exposed publicly; only 22/80/443.
- Rate-limit HTTP + WS (Redis-backed where distributed).

## Performance rules

- Budgets: server tick avg < 8 ms (60 Hz); client 60 FPS target / 30 FPS floor.
- Measure before optimizing (perf monitors + profiling tools in `tools/profiling`).
- Do not broadcast full state every tick; AOI + snapshot deltas.

## Asset-generation rules

- 100% original art. Vector SVG masters in `assets/source`, processed PNGs/atlases
  built by `tools/asset-pipeline` into `assets/processed` + `assets/atlases`,
  described by `assets-manifest.json`. Style bible: `docs/ART_STYLE.md`.
- No placeholder art, emojis, or stock icons in the final build. Dynamic text is
  never baked into images (web fonts render score/rank/buttons/menus).

## Deployment rules

- Docker multi-stage builds, non-root runtime, healthchecks, graceful SIGTERM
  shutdown (stop intake → notify rooms → grace period → persist → close).
- Reverse proxy: Caddy (auto-TLS, WS upgrade). Compose stack: client, server,
  postgres, redis, caddy. Runbooks in `docs/DEPLOYMENT.md` + `docs/OPERATIONS.md`.
- DB schema changes ONLY via migrations (`apps/server/migrations`).

## Git rules

- Branches: `main` (releasable), `development` (integration), feature branches.
- Conventional commits (`feat:`, `fix:`, `perf:`, `chore:`, `docs:`, `test:`).
  Meaningful milestone commits — no giant unexplained dumps.
