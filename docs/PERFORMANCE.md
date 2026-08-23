# PERFORMANCE

## Budgets (spec §48) vs measured

| Metric | Budget | Measured (M3) |
|---|---|---|
| Server tick avg | < 8 ms | 0.76–2.99 ms @ 10–200 bots (LOAD_TESTING.md) |
| Server tick heavy | 10–12 ms | worst rolling avg 2.99 ms |
| Client FPS | 60 target / 30 floor | 60 in E2E envs; debug panel measures live |
| Initial JS (gzip) | — | 44 KB app + 332 KB Phaser chunk |

## Techniques in place

- Simulation: spatial-hash broad phase, capsule narrow phase, bounded
  path buffers, no per-tick allocation storms, sorted-id determinism.
- Network: AOI food filtering (~76% state cut), 20 Hz snapshots vs 60 Hz sim,
  input intentions only, compact schema types (float32/uint8).
- Client: sprite pools with camera culling (food/powerups), single atlas
  (1 draw batch for world sprites), DOM text (zero canvas text cost),
  exponential smoothing/interpolation without allocations in the hot loop,
  low-quality mode + reduced-motion (spec §107) disabling decorative motion.
- Perf visibility: /metrics rolling tick stats + event-loop lag; in-game
  debug panel; load harness with regression thresholds (spec §98).

## Known headroom (do when measurements demand)

Worm-segment AOI, snapshot delta interest tiers, foodPool visibility via
Phaser culling lists, WebP/AVIF atlas variants, worker-thread rooms
(Colyseus scale-out) — each documented in code where relevant.
