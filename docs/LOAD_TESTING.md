# LOAD TESTING

## Method (spec §52)

Harness: `apps/bot` — AI clients (wander / seek food / avoid walls / flee /
hunt / boost / respawn) driving the REAL client protocol (colyseus.js, input
intentions at 30/s, AOI food deltas). Staggered joins at 40/s. Server metrics
sampled from `GET /metrics` every 2 s (rolling 5 s tick window, CPU, RSS,
event-loop lag).

Run: `pnpm test:load` (sweep 10→200, 30 s per profile) or
`tsx apps/bot/src/index.ts --count N --duration S --url ws://host/ws`.

## Results — 2026-08-23, commit 1fb246a

Environment: **2 vCPU cloud sandbox**, Node 22, production esbuild bundle,
`ROOM.maxPlayers=40` (200 bots ⇒ 5 rooms), **bots co-located on the same
2-vCPU box** (they compete with the server for CPU — see caveats).

| bots | joined | errors | tick avg (ms) | tick max (ms) | CPU avg/max | RSS max | loop lag max |
|---:|---:|---:|---:|---:|---|---:|---:|
| 10 | 10 | 0 | 0.76 | 7.55 | 11% / 20% | 150 MB | 2 ms |
| 25 | 25 | 0 | 1.43 | 13.27 | 18% / 28% | 184 MB | 2.1 ms |
| 50 | 50 | 0 | 2.26 | 31.91 | 33% / 44% | 218 MB | 5.2 ms |
| 75 | 75 | 0 | 2.41 | 26.11 | 43% / 51% | 276 MB | 14.8 ms |
| 100 | 100 | 0 | 2.44 | 41.54 | 51% / 63% | 339 MB | 18.6 ms |
| 150 | 150 | 0 | 2.84 | 73.86 | 65% / 72% | 445 MB | 26 ms |
| 200 | 200 | 0 | 2.99 | 128.82 | 75% / 84% | 407 MB | 246 ms |

## Reading

- **Budget check (spec §48):** average simulation tick stays < 3 ms at every
  profile — well inside the < 8 ms preferred budget at 60 Hz.
- **100% join success, 0 protocol errors** across 610 total bot sessions.
- Tick *max* spikes and the 246 ms loop-lag outlier at 200 bots track CPU
  saturation (75–84%) of the shared 2-vCPU box where the 200 schema-decoding
  bot clients run **in the same OS** as the server. This measures the whole
  circus, not the server alone.
- Memory scales linearly and modestly (≈1.5 MB per active session incl. room
  state), with RSS falling between profiles as rooms dispose — no leak
  signature.

## What we claim (and don't)

✔ 40 players/room and ≥200 concurrent sessions across 5 rooms are supported on
2 vCPU with co-located load generation.
✘ No claims yet for >200 CCU or for production hardware — rerun the sweep on
the VPS (4–8 vCPU, remote bots) before advertising capacity (tracked for M5).

## Regression thresholds (spec §98)

The sweep exits non-zero if any profile has incomplete joins or >2% errors.
Treat tick-avg > 6 ms at ≤100 bots on comparable hardware as a regression.
