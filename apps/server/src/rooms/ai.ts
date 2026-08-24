import { AI, WORM } from "@nibblio/config";
import type { Simulation, WormInput } from "@nibblio/game-core";
import { createRng, wrapAngle } from "@nibblio/shared";
import type { Rng } from "@nibblio/shared";

/** Server-side resident AI worm (spec §51 behaviors, in-room — no sockets).
 *  Personality jitter (aggression/caution/wobble) keeps bots from moving in
 *  lockstep. Bots read the same sim the humans play in; their inputs go
 *  through the identical pendingInputs path as human intentions. */

export const BOT_NAMES = [
  "Chompy", "Wiggles", "Sir Slither", "Noodle", "Munchkin", "Gulpy",
  "Twisty", "Sprinkles", "Doodle", "Snacky", "Loopy", "Nibbles",
  "Squirmy", "Bonbon", "Waffles", "Zigzag",
] as const;

export function shouldRunBots(channel: string): boolean {
  return (AI.channels as readonly string[]).includes(channel) ||
    channel.startsWith(AI.channelPrefix);
}

export class AiBrain {
  private rng: Rng;
  private angle: number;
  private seq = 0;
  /** personality */
  private readonly aggression: number;
  private readonly caution: number;
  private readonly wobble: number;
  private queryBuf: number[] = [];

  constructor(public readonly wormId: string, seed: number) {
    this.rng = createRng(seed);
    this.angle = this.rng.range(-Math.PI, Math.PI);
    this.aggression = this.rng.range(0.3, 0.95);
    this.caution = this.rng.range(0.7, 1.3);
    this.wobble = this.rng.range(0.05, 0.22);
  }

  think(sim: Simulation): WormInput | null {
    const world = sim.world;
    const me = world.worms.get(this.wormId);
    if (!me?.alive) return null;

    let boost = false;
    let targetX: number | null = null;
    let targetY: number | null = null;

    const size = world.worldSize;
    const margin = 650;

    // 1. wall avoidance dominates
    if (me.x < margin || me.y < margin || me.x > size - margin || me.y > size - margin) {
      targetX = size / 2 + this.rng.range(-1500, 1500);
      targetY = size / 2 + this.rng.range(-1500, 1500);
    } else {
      // 2. threats & prey
      let threatX = 0, threatY = 0, threatD = 850 * this.caution;
      let preyX = 0, preyY = 0, preyD = 1000;
      let hasThreat = false, hasPrey = false;
      for (const w of world.worms.values()) {
        if (w.id === this.wormId || !w.alive) continue;
        const d = Math.hypot(w.x - me.x, w.y - me.y);
        if (w.mass > me.mass * 1.25 && d < threatD) {
          hasThreat = true; threatX = w.x; threatY = w.y; threatD = d;
        } else if (me.mass > w.mass * 1.4 && d < preyD) {
          hasPrey = true; preyX = w.x; preyY = w.y; preyD = d;
        }
      }
      if (hasThreat) {
        targetX = me.x + (me.x - threatX);
        targetY = me.y + (me.y - threatY);
        boost = threatD < 420 && me.mass > WORM.minMass + 6;
      } else if (hasPrey && this.rng.next() < this.aggression) {
        // aim ahead of the prey's flank, not its head
        targetX = preyX;
        targetY = preyY;
        boost = preyD > 260 && me.mass > WORM.minMass + 14 && this.rng.next() < 0.35;
      } else {
        // 3. nearest food via the spatial index
        sim.queryFood(me.x, me.y, 900, this.queryBuf);
        let bestD = Infinity;
        for (const id of this.queryBuf) {
          const f = world.food.get(id);
          if (!f) continue;
          const d = Math.hypot(f.x - me.x, f.y - me.y);
          if (d < bestD) { bestD = d; targetX = f.x; targetY = f.y; }
        }
      }
    }

    if (targetX !== null && targetY !== null) {
      this.angle = Math.atan2(targetY - me.y, targetX - me.x)
        + this.rng.range(-this.wobble, this.wobble);
    } else if (this.rng.next() < 0.05) {
      this.angle = this.rng.range(-Math.PI, Math.PI);
    }

    return { seq: ++this.seq, angle: wrapAngle(this.angle), boost };
  }
}
