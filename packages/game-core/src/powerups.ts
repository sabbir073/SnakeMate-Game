import { POWERUPS, POWERUP_RULES, SIM } from "@nibblio/config";
import type { PowerupKind } from "@nibblio/config";
import { dist2 } from "@nibblio/shared";
import type { Rng } from "@nibblio/shared";
import type { PowerupState, StepEvents, WorldState, WormState } from "./types.js";

const KINDS = Object.keys(POWERUPS) as PowerupKind[];
const WEIGHTS = KINDS.map((k) => POWERUPS[k].spawnWeight);

/** Powerup subsystem (spec §19) — generic timed-effect model.
 *  Effects are stored on the worm as `effects[kind] = expiryTick`; the rest of
 *  the sim (movement, eating, boost) consults them via tick comparison, so a
 *  new powerup kind is: config entry + (optionally) one consult site. */

export function targetPowerupCount(playerCount: number): number {
  const scaled = Math.ceil((playerCount / 25) * POWERUP_RULES.worldCountPer25Players);
  return Math.min(POWERUP_RULES.maxWorld, Math.max(playerCount > 0 ? 2 : 0, scaled));
}

export function replenishPowerups(
  world: WorldState,
  rng: Rng,
  playerCount: number,
  events: StepEvents,
): void {
  const target = targetPowerupCount(playerCount);
  while (world.powerups.size < target) {
    const kind = KINDS[rng.weighted(WEIGHTS)] ?? "SPEED";
    const p: PowerupState = {
      id: world.nextEntityId++,
      kind,
      x: rng.range(0, world.worldSize),
      y: rng.range(0, world.worldSize),
      radius: POWERUPS[kind].radius,
    };
    world.powerups.set(p.id, p);
    events.powerupsSpawned.push(p);
  }
}

export function resolvePowerupPickup(
  world: WorldState,
  worm: WormState,
  events: StepEvents,
): void {
  if (!worm.alive) return;
  for (const p of world.powerups.values()) {
    const rr = worm.radius + p.radius;
    if (dist2(worm.x, worm.y, p.x, p.y) > rr * rr) continue;
    world.powerups.delete(p.id);
    events.powerupsRemoved.push(p.id);
    grantEffect(world, worm, p.kind);
    events.powerupsTaken.push({ wormId: worm.id, powerupId: p.id, kind: p.kind });
  }
}

export function grantEffect(world: WorldState, worm: WormState, kind: PowerupKind): void {
  const durTicks = Math.round(POWERUPS[kind].durationSec * SIM.tickRate);
  const current = worm.effects[kind] ?? 0;
  // stacking extends from now (or from current expiry if still active)
  const base = Math.max(world.tick, current);
  worm.effects[kind] = base + durTicks;
}

/** Prune expired effects (keeps snapshots/serialization small). */
export function pruneEffects(world: WorldState, worm: WormState): void {
  for (const key of Object.keys(worm.effects) as PowerupKind[]) {
    if ((worm.effects[key] ?? 0) <= world.tick) delete worm.effects[key];
  }
}

/** Active effects as compact string list (for network sync/UI). */
export function activeEffects(world: WorldState, worm: WormState): PowerupKind[] {
  const out: PowerupKind[] = [];
  for (const key of Object.keys(worm.effects) as PowerupKind[]) {
    if ((worm.effects[key] ?? 0) > world.tick) out.push(key);
  }
  return out;
}
