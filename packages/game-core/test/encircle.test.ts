import { describe, expect, it } from "vitest";
import { WORM } from "@nibblio/config";
import { createRng, wrapAngle } from "@nibblio/shared";
import { Simulation, createWorm, emptyEvents, refreshDerived } from "../src/index.js";
import type { WormInput } from "../src/index.js";

/** Wormate-parity physics regression (user QA): a big worm that coils around
 *  a small one must be able to squeeze the ring below the prey's own minimum
 *  turning circle, so the trapped worm runs out of room and dies against the
 *  surrounding body. With too low a big-worm turn floor the coil bottoms out
 *  wide and prey can orbit inside forever — this test locks the tuning. */

function makeSim(): Simulation {
  return new Simulation(createRng(7), 8000);
}

function spawn(s: Simulation, id: string, x: number, y: number, angle: number, mass: number) {
  const w = createWorm({ id, ownerId: id, nickname: id, skinId: "s0", x, y, angle, spawnTick: 0 });
  w.mass = mass;
  refreshDerived(w);
  s.addWorm(w);
  return w;
}

describe("encirclement physics", () => {
  it("a coiling big worm tightens below the trapped worm's escape circle", () => {
    // big worm's tightest coil must be smaller than the space the prey needs
    const bigTurnFloor = WORM.turnRateMin;
    const bigCoilRadius = WORM.baseSpeed / bigTurnFloor;
    const preyCircle = WORM.baseSpeed / WORM.turnRateMax; // prey's tightest orbit
    const preyRadius = WORM.baseRadius;
    // prey needs its orbit + its own head radius of clear space inside the ring
    expect(bigCoilRadius).toBeLessThan(preyCircle + preyRadius + 20);
  });

  it("a trapped small worm dies against the encircling body (slow squeeze)", () => {
    const s = makeSim();
    const cx = 4000;
    const cy = 4000;

    // big worm starts circling wide around the prey, already massive
    const coilR = WORM.baseSpeed / WORM.turnRateMin;
    const big = spawn(s, "big", cx + coilR + 160, cy, Math.PI / 2, 1500);
    // small prey in the middle, doing its best evasive circling
    const prey = spawn(s, "prey", cx, cy, 0, 12);

    const events = emptyEvents();
    const inputs = new Map<string, WormInput>();
    let seq = 0;

    // simulate up to 45s. The big worm glides its coil down toward a squeeze
    // radius just above its own tightest circle; the trapped worm circles
    // hard, but a hard constant turn drifts (as real play does) and the
    // shrinking ring leaves it nowhere to go.
    const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
    const squeezeR = 105; // < old-physics floor (112.5) — unreachable before the fix
    let died = 0;
    for (let t = 0; t < 45 * 60 && !died; t++) {
      seq++;
      const bd = Math.hypot(big.x - cx, big.y - cy);
      const bias = clamp(0.004 * (bd - squeezeR), -0.3, 0.3); // + = tilt inward
      const toCenter = Math.atan2(cy - big.y, cx - big.x);
      inputs.set("big", { seq, angle: wrapAngle(toCenter - Math.PI / 2 + bias), boost: false });
      // prey: sustained hard turn — its tightest orbit, drifting as real play does
      inputs.set("prey", { seq, angle: wrapAngle(prey.angle + 1.2), boost: false });
      s.step(inputs, events);
      if (!prey.alive) died = t;
    }
    expect(big.alive).toBe(true); // the squeeze never cost the big worm its head

    expect(prey.alive).toBe(false);
    expect(died).toBeGreaterThan(60); // not instant — a gradual squeeze
    expect(died).toBeLessThan(45 * 60); // but inescapable
  });
});
