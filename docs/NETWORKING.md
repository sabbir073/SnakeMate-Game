# NETWORKING

## Model (spec §24–30)

- Transport: WebSocket via Colyseus (`wss://` behind Caddy in production).
- Server simulation: fixed 60 Hz. Snapshot publish: 20 Hz (config
  `net.snapshotRate`). Client render: uncapped up to display refresh.
- Protocol has an explicit `PROTOCOL_VERSION` (packages/protocol). Join is
  refused with a friendly error on mismatch (spec §87–88).

## Client → server (intentions only)

```ts
// packages/protocol
interface InputMessage {
  seq: number;      // monotonically increasing per client
  angle: number;    // desired heading, radians [-π, π]
  boost: boolean;   // boost intent
}
```

Sent at most `net.inputRate` (30/s). The server NEVER accepts position, mass,
score, or kill claims from clients. Rate/shape violations are dropped and
counted (see ANTI_CHEAT.md).

## Server → client

- **Join ack:** playerId, protocol/server versions, world config hash, spawn state.
- **Snapshots (20 Hz):** per-worm compact state `{id, x, y, angle, speed, mass,
  boosting, alive, skin, lastProcessedSeq(own worm only)}` + food/powerup deltas
  (spawn/despawn ids, positions) for the client's area of interest.
- **Events:** death (killer, loot), leaderboard (top N + own rank, throttled),
  powerup grants/expiry, room notices.

## Prediction & reconciliation (spec §26)

Local worm: apply input immediately through game-core at the same fixed dt;
buffer unacked inputs; on snapshot, rewind to authoritative state for
`lastProcessedSeq`, replay newer inputs, then blend any residual error over
~100 ms (never snap unless error > hard threshold). Must remain playable at 50,
100, 150, 200, 300 ms RTT — verified by E2E latency tests.

## Interpolation (spec §27)

Remote worms/food render at `now − interpolationDelay` (≈1.5 snapshot
intervals, adaptive to jitter) between buffered snapshots. Extrapolation capped
at one interval when a snapshot is late.

## Interest management (spec §30, M3)

World partitioned into cells (config `net.aoiCellSize`); each client subscribes
to the cells overlapping its camera + margin. Entities outside AOI are not
serialized to that client.

## Reconnection (spec §74)

Colyseus reconnection token + server grace window (config
`net.reconnectGraceSec`). During grace the worm is server-piloted (straight,
no boost) and flagged; on reconnect the full local state is restored; on expiry
it dies normally and drops loot.

## Quality indicator (spec §108)

Rolling ping/jitter → Excellent / Good / Poor / Reconnecting. Thresholds in
config `net.quality`.

## Bandwidth discipline

Measured, not assumed: per-player bytes in/out tracked by the server perf
monitor and reported in load tests (docs/LOAD_TESTING.md).
