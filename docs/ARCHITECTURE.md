# ARCHITECTURE

## System overview

```
Browser (Phaser 3 client)
  │  HTTPS (static bundle)        ┌───────────────┐
  │  WSS (Colyseus)               │ Caddy (proxy) │  ← TLS, WS upgrade, headers
  └──────────────────────────────►└──────┬────────┘
                                         │
                            ┌────────────▼────────────┐
                            │ apps/server (Node+TS)   │
                            │  · Colyseus ArenaRoom   │
                            │  · 60 Hz fixed sim      │
                            │  · HTTP: health/version │
                            └───┬────────────────┬────┘
                                │ async batched  │ ephemeral
                        ┌───────▼──────┐  ┌──────▼─────┐
                        │ PostgreSQL   │  │ Redis      │
                        │ durable data │  │ rate-limit │
                        │ (migrations) │  │ presence   │
                        └──────────────┘  └────────────┘
```

## Monorepo layout & dependency direction

```
packages/shared        ← math, seeded RNG, utils            (depends on: nothing)
packages/config        ← ALL balance/tuning + game identity (shared)
packages/protocol      ← PROTOCOL_VERSION, msg/snapshot types (shared)
packages/game-core     ← deterministic simulation           (shared, config, protocol)
packages/asset-types   ← asset manifest types               (nothing)
apps/server            ← authoritative rooms                (game-core, protocol, config, shared)
apps/client            ← Phaser rendering + prediction      (game-core, protocol, config, shared, asset-types)
apps/bot               ← headless load/test clients         (protocol, config, shared)
tools/asset-pipeline   ← SVG→PNG→atlas builder              (asset-types)
```

Arrows only point downward; apps never import from each other.

## Decision records

### ADR-001: Single shared deterministic simulation (`game-core`)
**Decision:** every gameplay rule lives once, in pure TypeScript with a fixed
timestep (60 Hz), injected RNG and no wall-clock access.
**Why:** client-side prediction is only correct if the client can run the exact
server logic; duplicated logic drifts. Also makes the whole sim unit-testable
headlessly and replayable for debugging (determinism tests hash the state).
**Consequence:** game-core cannot use Phaser, Node APIs, `Date.now`, or
`Math.random`.

### ADR-002: Colyseus for rooms/transport
**Why:** authoritative room model, matchmaking, schema-based state sync, mature
reconnection support, scaling paths — vs hand-rolling ws plumbing. Hot-path
entity snapshots may bypass schema for compactness where measured necessary.

### ADR-003: Caddy over Nginx
**Why:** automatic Let's Encrypt issuance/renewal and one-line WebSocket
proxying remove the two most common production failure modes for this class of
game. Nginx equivalents documented in DEPLOYMENT.md as an alternative.

### ADR-004: Path-based worm bodies
**Why (spec §14–15):** the head integrates motion; the body samples the head's
historical path at fixed arc-length spacing. O(1) network cost per worm (head
state only); clients reconstruct bodies locally. Segments are render artifacts,
not entities.

### ADR-005: PostgreSQL outside the realtime loop
**Why (spec §31):** simulation ticks may never block on I/O. Stats/persistence
are queued and flushed in async batches. node-pg-migrate for migrations (SQL-
capable, no ORM in the hot path).

### ADR-006: Guest-first identity
Signed guest session tokens (nanoid id + HMAC). Account linking is architected
(guest_profiles vs users tables) but not built until after release criteria.

### ADR-007: World size default vs spec ceiling
Spec §21 names 100000×100000. That is retained as the configurable ceiling, but
default room world is tuned smaller (see packages/config `world.size`) so a
25–50 player room has sane food density and encounter rates. Balance-file
controlled; no code change needed to scale it.

## Realtime data flow

1. Client samples input → `{seq, angle, boost}` → sends at input rate (≤30/s).
2. Server queues inputs per player, applies them in the 60 Hz fixed loop through
   game-core, validates against anti-cheat envelopes.
3. Server publishes snapshots ~20 Hz, AOI-filtered per client (M3).
4. Client: local worm = prediction (replay unacked inputs over authoritative
   state); remote worms = interpolation between the two latest snapshots
   (render delay ≈ 1.5 snapshot intervals).

## Environments

development (local pnpm dev, in-memory fallbacks) → staging (compose variant,
separate secrets/DB) → production (VPS, Caddy TLS). See DEPLOYMENT.md / VPS.md.
