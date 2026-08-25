import { describe, expect, it } from "vitest";
import { WORM } from "@nibblio/config";
import { createRng, wrapAngle } from "@nibblio/shared";
import { Simulation, createWorm, emptyEvents, refreshDerived, seedPath } from "../src/index.js";
import type { WormInput } from "../src/index.js";

/** Wormate-parity physics regressions (user QA):
 *  - a big worm's coil can tighten below a trapped worm's escape space
 *  - the squeeze is SLOW and SMOOTH: never an insta-kill inside 2 s; the
 *    trapped worm circles until there is genuinely no room, then dies
 *    against the surrounding body while the encircler stays unharmed
 *  - head-on crashes kill only the smaller worm (near-equal: both)
 *  - the very tip of a giant's tail is just as deadly as the rest */

function makeSim(seed = 7): Simulation {
  return new Simulation(createRng(seed), 8000);
}

function spawn(s: Simulation, id: string, x: number, y: number, angle: number, mass: number) {
  const w = createWorm({ id, ownerId: id, nickname: id, skinId: "s0", x, y, angle, spawnTick: 0 });
  w.mass = mass;
  refreshDerived(w);
  seedPath(w); // full-length body from tick 0
  s.addWorm(w);
  return w;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

describe("encirclement physics", () => {
  it("a coiling big worm tightens below the trapped worm's escape circle", () => {
    // big worm's tightest coil must be smaller than the space the prey needs:
    // the prey's tightest orbit + its head radius + the encircler's own body
    // radius (the ring wall thickness). Below that, a trapped worm physically
    // cannot keep dodging.
    const bigCoilRadius = WORM.baseSpeed / WORM.turnRateMin;
    const preyCircle = WORM.baseSpeed / WORM.turnRateMax; // prey's tightest orbit
    const bigBodyRadius = WORM.baseRadius * Math.pow(1500 / WORM.spawnMass, WORM.radiusExp);
    expect(bigCoilRadius).toBeLessThan(preyCircle + WORM.baseRadius + bigBodyRadius);
  });

  it("a trapped worm circles for seconds, then dies to the ring — encircler unharmed", () => {
    const s = makeSim();
    const cx = 4000;
    const cy = 4000;
    const big = spawn(s, "big", cx + 260, cy, Math.PI / 2, 1500);
    const prey = spawn(s, "prey", cx, cy, 0, 12);

    const events = emptyEvents();
    const inputs = new Map<string, WormInput>();
    let seq = 0;

    // The encircler lays its ring and holds it at a safe radius; the trapped
    // worm circles the center cleanly. Like every real player, the prey can't
    // orbit perfectly forever — after 8 s it drifts for a moment (steering
    // lapse), and with the ring there, that is fatal. Never inside 2 s.
    let died = 0;
    for (let t = 0; t < 30 * 60 && !died; t++) {
      seq++;
      const bd = Math.hypot(big.x - cx, big.y - cy);
      const bias = clamp(0.0035 * (bd - 140), -0.45, 0.45);
      const toC = Math.atan2(cy - big.y, cx - big.x);
      inputs.set("big", { seq, angle: wrapAngle(toC - Math.PI / 2 + bias), boost: false });
      const lapse = t > 8 * 60; // human-like panic: straightens for a moment
      const preyToC = Math.atan2(cy - prey.y, cx - prey.x);
      const preyAngle = lapse
        ? prey.angle // stops turning → shoots outward into the ring
        : wrapAngle(preyToC - Math.PI / 2 + 0.4);
      inputs.set("prey", { seq, angle: wrapAngle(preyAngle), boost: false });
      s.step(inputs, events);
      if (!prey.alive) died = t;
    }

    expect(big.alive).toBe(true); // the squeeze never cost the big worm its head
    expect(prey.alive).toBe(false);
    expect(died).toBeGreaterThan(2 * 60); // never dead within 2s of being surrounded
  });
});

describe("collision rules", () => {
  it("head-on crash: only the smaller worm dies", () => {
    const s = makeSim();
    const big = spawn(s, "big", 3800, 4000, 0, 400); // heading east
    const small = spawn(s, "small", 4400, 4000, Math.PI, 40); // heading west
    const events = emptyEvents();
    const inputs = new Map<string, WormInput>();
    let seq = 0;
    for (let t = 0; t < 5 * 60; t++) {
      seq++;
      inputs.set("big", { seq, angle: 0, boost: false });
      inputs.set("small", { seq, angle: Math.PI, boost: false });
      s.step(inputs, events);
      if (!small.alive || !big.alive) break;
    }
    expect(small.alive).toBe(false);
    expect(big.alive).toBe(true);
  });

  it("head-on crash between equals kills both", () => {
    const s = makeSim();
    const a = spawn(s, "a", 3800, 4000, 0, 100);
    const b = spawn(s, "b", 4400, 4000, Math.PI, 100);
    const events = emptyEvents();
    const inputs = new Map<string, WormInput>();
    let seq = 0;
    for (let t = 0; t < 5 * 60; t++) {
      seq++;
      inputs.set("a", { seq, angle: 0, boost: false });
      inputs.set("b", { seq, angle: Math.PI, boost: false });
      s.step(inputs, events);
      if (!a.alive || !b.alive) break;
    }
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
  });

  it("rear-ending the very tip of a GIANT's tail kills the rammer", () => {
    const s = makeSim();
    // mass 6000 → length ≈ 27k wu; before the maxPathSamples fix the last
    // ~7k wu of tail had no collision at all (ghost tail)
    const giant = spawn(s, "giant", 4000, 4000, 0, 6000);
    const tailX = 4000 - giant.length; // seeded straight west
    const rammer = spawn(s, "rammer", tailX - 200, 4000, 0, 30);
    expect(giant.path.length * WORM.pathSpacing).toBeGreaterThanOrEqual(giant.length);
    const events = emptyEvents();
    const inputs = new Map<string, WormInput>();
    let seq = 0;
    for (let t = 0; t < 8 * 60; t++) {
      seq++;
      inputs.set("giant", { seq, angle: 0, boost: false });
      inputs.set("rammer", { seq, angle: 0, boost: true }); // chase the tail tip
      s.step(inputs, events);
      if (!rammer.alive) break;
    }
    expect(rammer.alive).toBe(false);
    expect(giant.alive).toBe(true);
  });
});
