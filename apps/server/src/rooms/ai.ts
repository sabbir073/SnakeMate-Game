import { AI, WORM } from "@nibblio/config";
import type { Simulation, WormInput } from "@nibblio/game-core";
import { createRng, wrapAngle } from "@nibblio/shared";
import type { Rng } from "@nibblio/shared";

/** Server-side resident AI worm (spec §51 behaviors, in-room — no sockets).
 *  Personality jitter (aggression/caution/wobble) keeps bots from moving in
 *  lockstep. Bots read the same sim the humans play in; their inputs go
 *  through the identical pendingInputs path as human intentions. */

/** Random, human-feeling nicknames — a fresh one every spawn (never a fixed
 *  roster). Three shapes keep the lobby varied: word+word, syllable mash, and
 *  word+number, mimicking how real players actually name themselves. */
const NAME_FIRST = [
  "Shadow", "Turbo", "Mega", "Neon", "Pixel", "Cosmic", "Lucky", "Sneaky",
  "Fuzzy", "Crazy", "Silent", "Golden", "Frost", "Blaze", "Storm", "Hyper",
  "Ninja", "Royal", "Wild", "Zen", "Retro", "Astro", "Candy", "Dark",
  "Epic", "Iron", "Jelly", "Mystic", "Nova", "Omega",
];
const NAME_SECOND = [
  "Worm", "Viper", "Racer", "Hunter", "King", "Queen", "Star", "Fang",
  "Loop", "Dash", "Byte", "Rider", "Wolf", "Fox", "Ghost", "Panda",
  "Comet", "Blade", "Muncher", "Noodle", "Slider", "Beast", "Chomp", "Zoom",
];
const NAME_SYLLA = ["zi", "ka", "mo", "lu", "ren", "ta", "vex", "bo", "nix", "sha", "fu", "dra", "pip", "gro", "mi", "zor"];

export function randomBotName(): string {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
  const style = Math.random();
  if (style < 0.45) {
    // ShadowViper / LuckyNoodle
    return `${pick(NAME_FIRST)}${pick(NAME_SECOND)}`;
  }
  if (style < 0.7) {
    // Kamoren / Vexsha — capitalized syllable mash
    const n = 2 + Math.floor(Math.random() * 2);
    let s = "";
    for (let i = 0; i < n; i++) s += pick(NAME_SYLLA);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // TurboFox77 / NovaKing123
  const num = Math.floor(Math.random() * 990) + 10;
  return `${pick(NAME_FIRST)}${pick(NAME_SECOND)}${num}`;
}

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

  /** If another worm's body surrounds us, returns the ring's center —
   *  the graceful play is to circle the shrinking space, not charge the wall.
   *  Detection: bucket nearby enemy body samples into 8 bearing sectors;
   *  ≥7 occupied sectors from one worm = we are enclosed. */
  private detectEnclosure(
    world: Simulation["world"], me: { x: number; y: number; mass: number },
  ): { cx: number; cy: number } | null {
    const RANGE = 700;
    for (const w of world.worms.values()) {
      if (w.id === this.wormId || !w.alive || w.mass < me.mass * 1.5) continue;
      if (Math.hypot(w.x - me.x, w.y - me.y) > w.length + RANGE) continue;
      let sectors = 0;
      let sx = 0, sy = 0, n = 0;
      const stride = 4; // path samples every ~10wu — check every ~40wu
      for (let i = 0; i < w.path.length; i += stride) {
        const p = w.path[i]!;
        const dx = p.x - me.x;
        const dy = p.y - me.y;
        if (dx * dx + dy * dy > RANGE * RANGE) continue;
        const sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8) & 7;
        sectors |= 1 << sector;
        sx += p.x; sy += p.y; n++;
      }
      let occupied = 0;
      for (let b = 0; b < 8; b++) if (sectors & (1 << b)) occupied++;
      if (occupied >= 7 && n > 0) return { cx: sx / n, cy: sy / n };
    }
    return null;
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

    // 0. trapped inside another worm's coil: circle the free space smoothly,
    //    hugging its center — survive while room remains, exactly like a
    //    skilled player (death comes only when the squeeze leaves no space)
    const trap = this.detectEnclosure(world, me);
    if (trap) {
      const toC = Math.atan2(trap.cy - me.y, trap.cx - me.x);
      const ccw = wrapAngle(toC - Math.PI / 2);
      const cw = wrapAngle(toC + Math.PI / 2);
      // keep our current sense of rotation — no panicked 180° flips
      const keepCcw = Math.abs(wrapAngle(me.angle - ccw)) <= Math.abs(wrapAngle(me.angle - cw));
      this.angle = keepCcw ? ccw + 0.4 : cw - 0.4; // bias toward the center
      return { seq: ++this.seq, angle: wrapAngle(this.angle), boost: false };
    }

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
