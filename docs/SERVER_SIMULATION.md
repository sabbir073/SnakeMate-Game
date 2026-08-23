# SERVER SIMULATION

## Structure

`ArenaRoom` (apps/server) owns one `Simulation` (packages/game-core) seeded
from the room id. `setSimulationInterval` drives `sim.step()` at 60 Hz;
`setPatchRate` publishes schema patches at 20 Hz, independently (spec §25).

## Step order (deterministic)

1. apply queued inputs (latest per worm)
2. integrate movement + boost drain/drops (worms iterated in sorted-id order)
3. world-boundary deaths
4. worm-vs-worm collisions (bounding-circle prefilter → head-vs-path capsule
   narrow phase)
5. food pickup (spatial-hash query, deterministic id ordering)
6. ambient food replenish (≤20/tick toward density target)

All randomness flows through the injected seeded RNG — replays and tests are
bit-reproducible (`simulation determinism` test).

## Events → network

`StepEvents` (deaths, foodEaten, foodSpawned/Removed, …) are turned into
schema deltas + targeted messages after each tick; the sim itself never
touches the network (pure).

## Perf accounting (spec §50)

Per-room tick avg/max ms tracked and logged on dispose; exposed via
`metrics()`. Measured M1 baseline: 0.11 ms avg / 1.5 ms max with 3 clients in
a fresh room (budget: <8 ms avg).

## Colyseus specifics

- `Encoder.BUFFER_SIZE = 512 KB` — the initial full-state encode carries the
  whole ambient food population until AOI (M3) trims per-client state.
- Rooms auto-dispose when empty; matchmaking creates additional rooms at
  `ROOM.maxPlayers` (40).
- Graceful shutdown: readiness flips false → Colyseus disconnects rooms →
  process exits (spec §73).
