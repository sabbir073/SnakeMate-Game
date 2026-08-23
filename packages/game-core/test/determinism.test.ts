import { describe, expect, it } from "vitest";
import { SIM, WORM } from "@nibblio/config";
import {
  createWorld, createWorm, stepWorld, hashWorld, emptyEvents,
  bodyPointAt, lengthForMass, radiusForMass, turnRateForMass,
} from "../src/index.js";
import type { WormInput } from "../src/index.js";

function makeWorldWithWorm(id = "w1") {
  const world = createWorld(10000);
  const worm = createWorm({
    id, ownerId: id, nickname: "T", skinId: "s0",
    x: 5000, y: 5000, angle: 0, spawnTick: 0,
  });
  world.worms.set(id, worm);
  return { world, worm };
}

describe("deterministic simulation", () => {
  it("identical input sequences produce identical world hashes", () => {
    const a = makeWorldWithWorm();
    const b = makeWorldWithWorm();
    const inputs = new Map<string, WormInput>();
    for (let t = 0; t < 600; t++) {
      const angle = Math.sin(t / 30) * Math.PI;
      inputs.set("w1", { seq: t, angle, boost: t % 120 < 30 });
      stepWorld(a.world, inputs);
      stepWorld(b.world, inputs);
    }
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    expect(a.world.tick).toBe(600);
  });

  it("divergent inputs produce divergent hashes", () => {
    const a = makeWorldWithWorm();
    const b = makeWorldWithWorm();
    const ia = new Map<string, WormInput>([["w1", { seq: 1, angle: 1, boost: false }]]);
    const ib = new Map<string, WormInput>([["w1", { seq: 1, angle: -1, boost: false }]]);
    for (let t = 0; t < 60; t++) {
      stepWorld(a.world, ia);
      stepWorld(b.world, ib);
    }
    expect(hashWorld(a.world)).not.toBe(hashWorld(b.world));
  });
});

describe("movement", () => {
  it("moves at baseSpeed when not boosting", () => {
    const { world, worm } = makeWorldWithWorm();
    const inputs = new Map<string, WormInput>([["w1", { seq: 1, angle: 0, boost: false }]]);
    const x0 = worm.x;
    stepWorld(world, inputs);
    expect(worm.x - x0).toBeCloseTo(WORM.baseSpeed * SIM.dt, 5);
    expect(worm.y).toBeCloseTo(5000, 5);
  });

  it("turn rate is bounded — cannot reverse instantly", () => {
    const { world, worm } = makeWorldWithWorm();
    const inputs = new Map<string, WormInput>([["w1", { seq: 1, angle: Math.PI, boost: false }]]);
    stepWorld(world, inputs);
    // after one tick the worm has turned at most turnRateMax*dt
    expect(Math.abs(worm.angle)).toBeLessThanOrEqual(WORM.turnRateMax * SIM.dt + 1e-9);
    expect(Math.abs(worm.angle)).toBeGreaterThan(0);
  });

  it("boost drains mass but never below minMass, then auto-cancels", () => {
    const { world, worm } = makeWorldWithWorm();
    worm.mass = WORM.spawnMass + 2;
    const inputs = new Map<string, WormInput>([["w1", { seq: 1, angle: 0, boost: true }]]);
    for (let t = 0; t < 60 * 30; t++) stepWorld(world, inputs); // 30 seconds
    expect(worm.mass).toBeGreaterThanOrEqual(WORM.minMass);
    expect(worm.boosting).toBe(false);
  });

  it("boost is faster than cruising", () => {
    const a = makeWorldWithWorm();
    a.worm.mass = 100;
    const b = makeWorldWithWorm();
    const boostIn = new Map<string, WormInput>([["w1", { seq: 1, angle: 0, boost: true }]]);
    const cruiseIn = new Map<string, WormInput>([["w1", { seq: 1, angle: 0, boost: false }]]);
    stepWorld(a.world, boostIn);
    stepWorld(b.world, cruiseIn);
    expect(a.worm.x).toBeGreaterThan(b.worm.x);
  });

  it("hitting the world edge kills the worm exactly once", () => {
    const { world, worm } = makeWorldWithWorm();
    worm.x = world.worldSize - worm.radius - 5;
    const inputs = new Map<string, WormInput>([["w1", { seq: 1, angle: 0, boost: true }]]);
    const events = emptyEvents();
    for (let t = 0; t < 120 && worm.alive; t++) stepWorld(world, inputs, events);
    expect(worm.alive).toBe(false);
    expect(events.deaths).toEqual([{ wormId: "w1", killerId: null }]);
  });
});

describe("worm body path", () => {
  it("spawns with a fully seeded body", () => {
    const { worm } = makeWorldWithWorm();
    expect(worm.path.length).toBeGreaterThan(worm.length / WORM.pathSpacing - 2);
  });

  it("bodyPointAt(0) is the head; farther points trail behind", () => {
    const { world, worm } = makeWorldWithWorm();
    const inputs = new Map<string, WormInput>([["w1", { seq: 1, angle: 0.3, boost: false }]]);
    for (let t = 0; t < 300; t++) stepWorld(world, inputs);
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 0 };
    bodyPointAt(worm, 0, p0);
    expect(p0.x).toBe(worm.x);
    bodyPointAt(worm, 100, p1);
    const d = Math.hypot(p1.x - worm.x, p1.y - worm.y);
    // arc distance 100 ⇒ straight-line distance ≤ 100, but same order of magnitude
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThanOrEqual(100 + 1e-6);
  });

  it("body samples are spaced ≈ pathSpacing apart along the path", () => {
    const { world, worm } = makeWorldWithWorm();
    const inputs = new Map<string, WormInput>([["w1", { seq: 1, angle: 0, boost: false }]]);
    for (let t = 0; t < 120; t++) stepWorld(world, inputs);
    for (let i = 0; i + 1 < Math.min(worm.path.length, 10); i++) {
      const a = worm.path[i]!;
      const b = worm.path[i + 1]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(WORM.pathSpacing, 3);
    }
  });
});

describe("derived attributes", () => {
  it("radius and length grow with mass", () => {
    expect(radiusForMass(100)).toBeGreaterThan(radiusForMass(10));
    expect(lengthForMass(100)).toBeGreaterThan(lengthForMass(10));
  });
  it("turn rate shrinks with mass toward the floor", () => {
    expect(turnRateForMass(WORM.spawnMass)).toBeCloseTo(WORM.turnRateMax);
    expect(turnRateForMass(1e9)).toBeCloseTo(WORM.turnRateMin);
  });
});
