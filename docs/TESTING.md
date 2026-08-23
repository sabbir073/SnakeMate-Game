# TESTING

## Layers

1. **Unit (Vitest)** — `packages/*/test`. game-core is pure/deterministic, so
   movement, collision, food, boost, and balance invariants are tested
   headlessly, including bit-exact determinism (same seed + inputs ⇒ identical
   state) and divergence checks. 45 tests as of M1.
2. **Browser E2E (Playwright)** — `apps/client/e2e`. Boots the REAL server +
   vite via `webServer`; drives real Chromium. Suites:
   - `single-player.spec.ts`: homepage/branding, join flow, movement, food
     collection + growth, prediction error bounds.
   - `multiplayer.spec.ts`: two isolated browser contexts in one arena —
     mutual visibility, leaderboard on both, movement observed remotely,
     disconnect removes the worm, prediction stability at simulated 150 ms.
   - `death-respawn.spec.ts`: boost into the wall → death screen with stats →
     PLAY AGAIN → alive again.
3. **Load (bot clients)** — `apps/bot`; profiles land in M3 (docs/LOAD_TESTING.md).

## Running

```bash
pnpm test          # all unit tests
pnpm test:e2e      # Playwright (from repo root)
pnpm gate          # typecheck → unit → build → asset manifest
```

E2E browser resolution: `PW_CHROMIUM_PATH` env override → preinstalled
`/opt/pw-browsers/chromium` (CI/sandbox) → Playwright registry download.

## Rules (CLAUDE.md)

- A feature is complete only after typecheck + tests + runtime verification
  (≥2 clients for multiplayer features).
- E2E asserts through the read-only `window.__nibblio` probe — never by
  screen-scraping canvas pixels.
- No player-capacity claims without a recorded load-test run.
