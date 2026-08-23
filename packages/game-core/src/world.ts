import { WORLD } from "@nibblio/config";
import type { Rng } from "@nibblio/shared";
import type { StepEvents, WorldState, WormInput } from "./types.js";
import { applyInput, stepWormMovement } from "./movement.js";

export function createWorld(worldSize: number = WORLD.size): WorldState {
  return {
    tick: 0,
    worldSize,
    worms: new Map(),
    food: new Map(),
    powerups: new Map(),
    nextEntityId: 1,
  };
}

export function emptyEvents(): StepEvents {
  return {
    deaths: [],
    foodEaten: [],
    powerupsTaken: [],
    foodSpawned: [],
    foodRemoved: [],
    powerupsSpawned: [],
    powerupsRemoved: [],
  };
}

/** Advance the whole world one fixed tick.
 *  `inputs` maps wormId → the input to apply this tick (latest queued).
 *  `rng` drives every random decision (food spawns etc.) — injected so the
 *  server owns randomness and tests/replays are reproducible.
 *
 *  M0 scaffold: movement + world bounds. Food, collision, powerups are added
 *  in M1 as further phases of this same function. */
export function stepWorld(
  world: WorldState,
  inputs: ReadonlyMap<string, WormInput>,
  events: StepEvents = emptyEvents(),
  _rng?: Rng,
): StepEvents {
  world.tick++;

  // 1. inputs
  for (const [wormId, input] of inputs) {
    const w = world.worms.get(wormId);
    if (w && w.alive) applyInput(w, input);
  }

  // 2. movement
  for (const w of world.worms.values()) {
    if (!w.alive) continue;
    stepWormMovement(w, world.tick);

    // 3. world bounds: touching the edge kills (spec §21/§111 boundary rule)
    const r = w.radius;
    if (
      w.x - r < 0 || w.y - r < 0 ||
      w.x + r > world.worldSize || w.y + r > world.worldSize
    ) {
      w.alive = false;
      events.deaths.push({ wormId: w.id, killerId: null });
    }
  }

  return events;
}

/** Deterministic order-independent state fingerprint for determinism tests
 *  and desync detection. Not cryptographic. */
export function hashWorld(world: WorldState): number {
  let h = 0x811c9dc5 ^ world.tick;
  const mix = (v: number): void => {
    // quantize floats so the hash is stable across serialization round-trips
    const q = Math.round(v * 1024) | 0;
    h ^= q;
    h = Math.imul(h, 0x01000193);
  };
  const wormIds = [...world.worms.keys()].sort();
  for (const id of wormIds) {
    const w = world.worms.get(id)!;
    mix(w.x); mix(w.y); mix(w.angle); mix(w.mass); mix(w.alive ? 1 : 0);
  }
  const foodIds = [...world.food.keys()].sort((a, b) => a - b);
  for (const id of foodIds) {
    const f = world.food.get(id)!;
    mix(f.x); mix(f.y); mix(f.value);
  }
  return h >>> 0;
}
