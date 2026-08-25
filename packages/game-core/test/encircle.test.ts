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
    // big worm's tightest coil must be smaller than the space the prey needs:
    // the prey's tightest orbit + its head radius + the encircler's own body
    // radius (the ring wall thickness). Below that, a trapped worm physically
    // cannot keep dodging.
    const bigCoilRadius = WORM.baseSpeed / WORM.turnRateMin;
    const preyCircle = WORM.baseSpeed / WORM.turnRateMax; // prey's tightest orbit
    const bigBodyRadius = WORM.baseRadius * Math.pow(1500 / WORM.spawnMass, WORM.radiusExp);
    expect(bigCoilRadius).toBeLessThan(preyCircle + WORM.baseRadius + bigBodyRadius);
  });

  it("a trapped small worm dies against the encircling body (slow squeeze)", () => {
    const s = makeSim();
    const cx = 4000;
    const cy = 4000;

    // big worm starts circling wide around the prey, already massive
    const big = spawn(s, "big", cx + 260, cy, Math.PI / 2, 1500);
    // small prey in the middle, circling the shrinking space like a real player
    const prey = spawn(s, "prey", cx, cy, 0, 12);

    const events = emptyEvents();
    const inputs = new Map<string, WormInput>();
    let seq = 0;

    // simulate up to 60s of the wormate squeeze: the coil shrinks SMOOTHLY to
    // hold just outside the prey's reach, then closes decisively while the
    // prey is on the far side — the trapped worm keeps circling until the
    // ring is smaller than its own turning circle and it crashes into the
    // body automatically. Never a 2-second insta-kill.
    const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
    let closing = false;
    let died = 0;
    for (let t = 0; t < 60 * 60 && !died; t++) {
      seq++;
      const bd = Math.hypot(big.x - cx, big.y - cy);
      const bigTh = Math.atan2(big.y - cy, big.x - cx);
      const preyTh = Math.atan2(prey.y - cy, prey.x - cx);
      const sep = Math.abs(wrapAngle(bigTh - preyTh));
      if (!closing && t > 10 * 60 && sep > 2.4 && bd < 150) closing = true;
      const targetR = closing ? 88 : 135; // hold outside reach, then squeeze
      const cap = closing ? 0.5 : 0.22;
      const bias = clamp(0.0035 * (bd - targetR), -cap, cap); // + = tilt inward
      const toCenter = Math.atan2(cy - big.y, cx - big.x);
      inputs.set("big", { seq, angle: wrapAngle(toCenter - Math.PI / 2 + bias), boost: false });
      // prey: circles the trap smoothly, hugging the center
      const preyToC = Math.atan2(cy - prey.y, cx - prey.x);
      inputs.set("prey", { seq, angle: wrapAngle(preyToC - Math.PI / 2 + 0.4), boost: false });
      s.step(inputs, events);
      if (!prey.alive) died = t;
    }
    expect(big.alive).toBe(true); // the squeeze never cost the big worm its head

    expect(prey.alive).toBe(false);
    expect(died).toBeGreaterThan(2 * 60); // never dead within 2s of being surrounded
    expect(died).toBeLessThan(60 * 60); // but inescapable once the ring closes
  });
});
