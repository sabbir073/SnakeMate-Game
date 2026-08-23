# Nibblio 🪱

**Nibblio** is an original browser-based real-time multiplayer worm arena.
Eat, grow, boost, outmaneuver other worms, and climb the leaderboard — instantly
playable in any modern browser on desktop or mobile, no installation.

> Repo: https://github.com/sabbir073/SnakeMate-Game

## Quick start (development)

```bash
pnpm install
cp .env.example .env        # dev defaults work out of the box
pnpm dev                    # starts game server (:2567) + client (:5173)
```

Open http://localhost:5173, enter a nickname, hit **PLAY**.

Postgres/Redis are optional in development (the server runs in memory-only mode
without them). To run the full stack:

```bash
pnpm docker:up
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | client + server dev servers with hot reload |
| `pnpm build` | build all packages and apps |
| `pnpm test` | unit tests (Vitest) across the workspace |
| `pnpm test:e2e` | Playwright browser E2E (incl. two-client multiplayer) |
| `pnpm test:load` | bot load-test harness |
| `pnpm typecheck` | TypeScript strict check across the workspace |
| `pnpm gate` | quality gate: typecheck → tests → build |
| `pnpm asset:build` | rebuild processed assets + atlases from SVG masters |
| `pnpm docker:up` / `docker:down` | full stack via Docker Compose |

## Architecture in one paragraph

A pnpm monorepo. `packages/game-core` holds the entire deterministic simulation
(fixed 60 Hz timestep, pure functions, injected RNG/time); the Colyseus server
(`apps/server`) runs it authoritatively while the Phaser client (`apps/client`)
runs the *same code* for client-side prediction, reconciling against ~20 Hz server
snapshots and interpolating remote entities. Clients send input intentions only.
PostgreSQL persists profiles/stats via migrations (never in the realtime loop);
Redis handles rate limiting and matchmaking metadata. Caddy terminates TLS and
proxies WebSockets in production. Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Documentation

Everything lives in [`docs/`](docs/) — start with `ARCHITECTURE.md`,
`GAMEPLAY.md`, `NETWORKING.md`, `DEPLOYMENT.md`. Project rules: [`CLAUDE.md`](CLAUDE.md).
Requirements: [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md). Progress:
[`docs/TASKS.md`](docs/TASKS.md).

## License / originality

All code, art, audio, and branding are original works created for this project.
No third-party game assets are copied. Dependencies retain their own licenses.
