import {
  BOOST, FOOD, FOOD_RULES, ROOM, SCORE, SIM, WORLD, WORM,
} from "@nibblio/config";
import type { FoodKind } from "@nibblio/config";
import { dist2, pointSegmentDist2 } from "@nibblio/shared";
import type { Rng } from "@nibblio/shared";
import { applyInput, stepWormMovement } from "./movement.js";
import { pruneEffects, replenishPowerups, resolvePowerupPickup } from "./powerups.js";
import { SpatialHash } from "./spatial-hash.js";
import type {
  FoodState, PathSample, StepEvents, WorldState, WormInput, WormState,
} from "./types.js";
import { bodyPointAt, refreshDerived } from "./worm.js";
import { createWorld, emptyEvents } from "./world.js";

const AMBIENT_KINDS: FoodKind[] = ["COMMON", "RARE", "EPIC", "BONUS"];
const AMBIENT_WEIGHTS = AMBIENT_KINDS.map((k) => FOOD[k].spawnWeight);
const MAX_FOOD_RADIUS = Math.max(...Object.values(FOOD).map((f) => f.radius));

/** Full authoritative simulation (spec phases 6–10).
 *  Owns the world plus its spatial indexes. All methods are deterministic
 *  given the injected RNG. The client instantiates one of these too (without
 *  food spawning) for prediction of the local worm. */
export class Simulation {
  readonly world: WorldState;
  private readonly foodHash: SpatialHash;
  private readonly rng: Rng;
  /** Max food spawned per tick to avoid burst allocations. */
  private readonly spawnPerTick = 20;
  private readonly queryBuf: number[] = [];
  private readonly scratch: PathSample = { x: 0, y: 0 };

  constructor(rng: Rng, worldSize: number = WORLD.size) {
    this.world = createWorld(worldSize);
    this.foodHash = new SpatialHash(256);
    this.rng = rng;
  }

  /** Broad-phase food id query for AOI/interest management (ids, unsorted). */
  queryFood(x: number, y: number, radius: number, out: number[]): number[] {
    return this.foodHash.queryRadius(x, y, radius, out);
  }

  get targetAmbientFood(): number {
    const area = this.world.worldSize * this.world.worldSize;
    return Math.min(FOOD_RULES.maxAmbient, Math.round((area / 1e6) * FOOD_RULES.densityPer1e6));
  }

  /** Advance one fixed tick. */
  step(inputs: ReadonlyMap<string, WormInput>, events: StepEvents = emptyEvents()): StepEvents {
    const w = this.world;
    w.tick++;

    // 1. apply inputs
    for (const [wormId, input] of inputs) {
      const worm = w.worms.get(wormId);
      if (worm?.alive) applyInput(worm, input);
    }

    // 2. integrate movement (+ boost drops), deterministic iteration order
    for (const worm of this.wormsSorted()) {
      if (!worm.alive) continue;
      stepWormMovement(worm, w.tick);
      this.handleBoostDrops(worm, events);
    }

    // 3. world-boundary deaths
    for (const worm of this.wormsSorted()) {
      if (!worm.alive) continue;
      const r = worm.radius;
      if (
        worm.x - r < 0 || worm.y - r < 0 ||
        worm.x + r > w.worldSize || worm.y + r > w.worldSize
      ) {
        this.kill(worm, null, events);
      }
    }

    // 4. worm-vs-worm collisions
    this.resolveCollisions(events);

    // 5. magnet pull + food pickup
    this.applyMagnetPull();
    this.resolveFoodPickup(events);

    // 6. powerups: pickup + world replenish (spec §19)
    let alivePlayers = 0;
    for (const worm of this.wormsSorted()) {
      if (!worm.alive) continue;
      alivePlayers++;
      resolvePowerupPickup(w, worm, events);
      if (w.tick % 30 === 0) pruneEffects(w, worm);
    }
    replenishPowerups(w, this.rng, alivePlayers, events);

    // 7. ambient food replenish
    this.replenishFood(events);

    return events;
  }

  // ── worms ─────────────────────────────────────────────────────────────────

  private wormsSorted(): WormState[] {
    // Map preserves insertion order which can differ between server and a
    // late-joining observer; sort by id for cross-instance determinism.
    return [...this.world.worms.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  addWorm(worm: WormState): void {
    this.world.worms.set(worm.id, worm);
  }

  removeWorm(id: string): void {
    this.world.worms.delete(id);
  }

  /** Pick a spawn location clear of other worms (spec §111). */
  findSpawnSpot(): { x: number; y: number } {
    const margin = WORM.baseLength + 200;
    const size = this.world.worldSize;
    let best = { x: size / 2, y: size / 2 };
    let bestClearance = -1;
    for (let i = 0; i < ROOM.spawnAttempts; i++) {
      const x = this.rng.range(margin, size - margin);
      const y = this.rng.range(margin, size - margin);
      let clearance = Infinity;
      for (const w of this.world.worms.values()) {
        if (!w.alive) continue;
        const d = Math.sqrt(dist2(w.x, w.y, x, y));
        if (d < clearance) clearance = d;
      }
      if (clearance >= ROOM.spawnClearRadius) return { x, y };
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = { x, y };
      }
    }
    return best;
  }

  randomAngle(): number {
    return this.rng.range(-Math.PI, Math.PI);
  }

  /** External kill (reconnect-grace expiry, admin) — drops loot like any death.
   *  Call between ticks with the events object that will be synced next. */
  forceKill(id: string, events: StepEvents): void {
    const worm = this.world.worms.get(id);
    if (worm?.alive) this.kill(worm, null, events);
  }

  private kill(worm: WormState, killerId: string | null, events: StepEvents): void {
    if (!worm.alive) return;
    worm.alive = false;
    worm.boosting = false;
    events.deaths.push({ wormId: worm.id, killerId });

    if (killerId) {
      const killer = this.world.worms.get(killerId);
      if (killer?.alive) {
        killer.kills++;
        killer.score += SCORE.perKill;
      }
    }
    this.dropDeathLoot(worm, events);
  }

  /** Scatter a fraction of the dead worm's mass along its body (spec §112). */
  private dropDeathLoot(worm: WormState, events: StepEvents): void {
    const totalValue = worm.mass * FOOD_RULES.deathDropFraction;
    const pellet = FOOD.DEATH_LOOT;
    const count = Math.max(1, Math.floor(totalValue / pellet.value));
    const bodyLen = worm.length;
    for (let i = 0; i < count; i++) {
      const along = (i / count) * bodyLen;
      bodyPointAt(worm, along, this.scratch);
      const jx = this.rng.range(-FOOD_RULES.deathScatter, FOOD_RULES.deathScatter);
      const jy = this.rng.range(-FOOD_RULES.deathScatter, FOOD_RULES.deathScatter);
      this.spawnFood("DEATH_LOOT", this.scratch.x + jx, this.scratch.y + jy, events);
    }
  }

  private handleBoostDrops(worm: WormState, events: StepEvents): void {
    if (!worm.boosting) return;
    while (worm.boostDropAccum >= BOOST.dropInterval) {
      worm.boostDropAccum -= BOOST.dropInterval;
      bodyPointAt(worm, worm.length, this.scratch);
      this.spawnFoodWithValue(
        "COMMON", this.scratch.x, this.scratch.y, BOOST.dropFoodValue, events,
      );
    }
  }

  // ── collision (spec §20, phase 8) ────────────────────────────────────────

  private resolveCollisions(events: StepEvents): void {
    const worms = this.wormsSorted().filter((w) => w.alive);
    const dead = new Map<string, string | null>(); // victim → killer

    for (const a of worms) {
      for (const b of worms) {
        if (a === b) continue;
        // bounding prefilter: b's whole body lies within b.length of b's head
        const reach = a.radius + b.length + b.radius;
        if (dist2(a.x, a.y, b.x, b.y) > reach * reach) continue;

        const contact = this.headHitsBody(a, b);
        if (contact === "body") {
          dead.set(a.id, b.id);
        } else if (contact === "head") {
          // head-on crash: the SMALLER worm loses (wormate rule). Only a
          // near-equal matchup (within 5% mass) takes both worms down —
          // the symmetric iteration marks each side in its own pass.
          if (a.mass <= b.mass * 1.05) dead.set(a.id, b.id);
        }
      }
    }

    for (const [victimId, killerId] of dead) {
      const victim = this.world.worms.get(victimId);
      if (!victim) continue;
      // SHIELD blocks one collision death and is consumed (never blocks walls)
      if ((victim.effects.SHIELD ?? 0) > this.world.tick) {
        delete victim.effects.SHIELD;
        continue;
      }
      // mutual head-on: both are in `dead`; killer credit still applies
      this.kill(victim, killerId, events);
    }
  }

  /** Narrow phase: does worm A's head hit worm B — and WHERE?
   *  "head" = head-on contact (B's head circle or the first couple of body
   *  radii behind it); "body" = anywhere else along B's body path. */
  private headHitsBody(a: WormState, b: WormState): "head" | "body" | null {
    const rr = a.radius + b.radius;
    // head-vs-head
    if (dist2(a.x, a.y, b.x, b.y) <= rr * rr) return "head";

    // head vs body capsules along b's path samples
    const path = b.path;
    if (path.length === 0) return null;
    const maxSamples = Math.min(
      path.length,
      Math.ceil(b.length / WORM.pathSpacing) + 1,
    );
    // contact within ~2 head radii of B's head still counts as head-on
    const headZoneSamples = Math.ceil((b.radius * 2) / WORM.pathSpacing);
    let px = b.x;
    let py = b.y;
    const rr2 = rr * rr;
    for (let i = 0; i < maxSamples; i++) {
      const s = path[i]!;
      if (pointSegmentDist2(a.x, a.y, px, py, s.x, s.y) <= rr2) {
        return i < headZoneSamples ? "head" : "body";
      }
      px = s.x;
      py = s.y;
    }
    return null;
  }

  // ── food (spec §18, phase 7) ─────────────────────────────────────────────

  private spawnFood(kind: FoodKind, x: number, y: number, events: StepEvents): FoodState {
    return this.spawnFoodWithValue(kind, x, y, FOOD[kind].value, events);
  }

  private spawnFoodWithValue(
    kind: FoodKind, x: number, y: number, value: number, events: StepEvents,
  ): FoodState {
    const size = this.world.worldSize;
    const cl = (v: number): number => (v < 0 ? 0 : v > size ? size : v);
    const food: FoodState = {
      id: this.world.nextEntityId++,
      kind,
      x: cl(x),
      y: cl(y),
      value,
      radius: FOOD[kind].radius,
    };
    this.world.food.set(food.id, food);
    this.foodHash.insert(food.id, food.x, food.y);
    events.foodSpawned.push(food);
    return food;
  }

  private removeFood(id: number, events: StepEvents): void {
    if (this.world.food.delete(id)) {
      this.foodHash.remove(id);
      events.foodRemoved.push(id);
    }
  }

  /** MAGNET effect: food inside the pull radius drifts toward the head. */
  private applyMagnetPull(): void {
    const pullSpeed = 700; // wu/s — fast enough to feel magnetic, still visible
    for (const worm of this.wormsSorted()) {
      if (!worm.alive) continue;
      if ((worm.effects.MAGNET ?? 0) <= this.world.tick) continue;
      this.foodHash.queryRadius(worm.x, worm.y, FOOD_RULES.magnetRadius, this.queryBuf);
      this.queryBuf.sort((x, y) => x - y);
      for (const foodId of this.queryBuf) {
        const food = this.world.food.get(foodId);
        if (!food) continue;
        const d2 = dist2(worm.x, worm.y, food.x, food.y);
        if (d2 > FOOD_RULES.magnetRadius ** 2 || d2 < 1) continue;
        const d = Math.sqrt(d2);
        const stepLen = Math.min(pullSpeed * SIM.dt, d);
        food.x += ((worm.x - food.x) / d) * stepLen;
        food.y += ((worm.y - food.y) / d) * stepLen;
        this.foodHash.update(food.id, food.x, food.y);
      }
    }
  }

  private resolveFoodPickup(events: StepEvents): void {
    for (const worm of this.wormsSorted()) {
      if (!worm.alive) continue;
      const reach = worm.radius + MAX_FOOD_RADIUS + FOOD_RULES.pickupSlack;
      this.foodHash.queryRadius(worm.x, worm.y, reach, this.queryBuf);
      if (this.queryBuf.length === 0) continue;
      // deterministic ordering
      this.queryBuf.sort((x, y) => x - y);
      for (const foodId of this.queryBuf) {
        const food = this.world.food.get(foodId);
        if (!food) continue;
        const pickupR = worm.radius + food.radius + FOOD_RULES.pickupSlack;
        if (dist2(worm.x, worm.y, food.x, food.y) > pickupR * pickupR) continue;
        this.eat(worm, food, events);
      }
    }
  }

  private eat(worm: WormState, food: FoodState, events: StepEvents): void {
    const t = this.world.tick;
    const doubleGrowth = (worm.effects.DOUBLE_GROWTH ?? 0) > t;
    // highest active multiplier wins: 10X > 5X > 2X
    const scoreMult =
      (worm.effects.SCORE_X10 ?? 0) > t ? 10 :
      (worm.effects.SCORE_X5 ?? 0) > t ? 5 :
      (worm.effects.SCORE_MULTIPLIER ?? 0) > t ? 2 : 1;
    worm.mass += food.value * (doubleGrowth ? 2 : 1);
    worm.score += food.value * SCORE.perFoodValue * scoreMult;
    refreshDerived(worm);
    this.removeFood(food.id, events);
    events.foodEaten.push({ wormId: worm.id, foodId: food.id, value: food.value });
  }

  private replenishFood(events: StepEvents): void {
    const target = this.targetAmbientFood;
    let deficit = target - this.world.food.size;
    // fast initial fill (fresh/half-empty room), gentle trickle afterwards
    const perTick = deficit > target / 2 ? 200 : this.spawnPerTick;
    let spawned = 0;
    while (deficit > 0 && spawned < perTick) {
      const kind = AMBIENT_KINDS[this.rng.weighted(AMBIENT_WEIGHTS)] ?? "COMMON";
      const x = this.rng.range(0, this.world.worldSize);
      const y = this.rng.range(0, this.world.worldSize);
      this.spawnFood(kind, x, y, events);
      deficit--;
      spawned++;
    }
  }
}
