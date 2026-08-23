import { describe, expect, it } from "vitest";
import { FOOD, FOOD_RULES, SCORE, WORM } from "@nibblio/config";
import { createRng } from "@nibblio/shared";
import { Simulation, createWorm, emptyEvents, SpatialHash } from "../src/index.js";
import type { StepEvents, WormInput } from "../src/index.js";

function sim(seed = 42, size = 4000): Simulation {
  return new Simulation(createRng(seed), size);
}

function addWorm(s: Simulation, id: string, x: number, y: number, angle = 0, mass = WORM.spawnMass) {
  const w = createWorm({
    id, ownerId: id, nickname: id, skinId: "s0", x, y, angle, spawnTick: 0,
  });
  if (mass !== WORM.spawnMass) {
    w.mass = mass;
    w.radius = 0; // recomputed below
    // refresh derived by importing helpers indirectly: simplest re-create length
  }
  s.addWorm(w);
  return w;
}

const noInputs = new Map<string, WormInput>();

describe("SpatialHash", () => {
  it("insert/update/remove/query behave", () => {
    const h = new SpatialHash(100);
    h.insert(1, 50, 50);
    h.insert(2, 500, 500);
    const buf: number[] = [];
    expect(h.queryRadius(60, 60, 30, buf)).toContain(1);
    expect(buf).not.toContain(2);
    h.update(1, 510, 510);
    h.queryRadius(500, 500, 50, buf);
    expect(buf).toContain(1);
    expect(buf).toContain(2);
    h.remove(2);
    h.queryRadius(500, 500, 50, buf);
    expect(buf).not.toContain(2);
    expect(h.size).toBe(1);
    h.clear();
    expect(h.size).toBe(0);
  });

  it("queryAABB finds entities in box", () => {
    const h = new SpatialHash(64);
    h.insert(7, 10, 10);
    const buf: number[] = [];
    expect(h.queryAABB(0, 0, 64, 64, buf)).toContain(7);
    expect(h.queryAABB(200, 200, 300, 300, buf)).not.toContain(7);
  });
});

describe("food system", () => {
  it("replenishes ambient food toward the density target", () => {
    const s = sim();
    const events = emptyEvents();
    for (let t = 0; t < 600; t++) s.step(noInputs, events);
    expect(s.world.food.size).toBe(s.targetAmbientFood);
    expect(events.foodSpawned.length).toBeGreaterThanOrEqual(s.targetAmbientFood);
    // never DEATH_LOOT from ambient spawning
    expect(events.foodSpawned.every((f) => f.kind !== "DEATH_LOOT")).toBe(true);
  });

  it("worm eats food it passes over and grows", () => {
    const s = sim();
    const w = addWorm(s, "eater", 2000, 2000);
    // fill world food first
    for (let t = 0; t < 400; t++) s.step(noInputs);
    const massBefore = w.mass;
    const scoreBefore = w.score;
    const events = emptyEvents();
    // drive forward for 10 seconds through food fields
    const inputs = new Map<string, WormInput>([["eater", { seq: 1, angle: 0, boost: false }]]);
    for (let t = 0; t < 600 && w.alive; t++) s.step(inputs, events);
    expect(events.foodEaten.length).toBeGreaterThan(0);
    expect(w.mass).toBeGreaterThan(massBefore);
    expect(w.score).toBeGreaterThanOrEqual(scoreBefore + events.foodEaten.length * SCORE.perFoodValue);
  });

  it("eaten food is removed from the world exactly once", () => {
    const s = sim();
    addWorm(s, "w", 2000, 2000);
    const events = emptyEvents();
    for (let t = 0; t < 900; t++) s.step(noInputs, events);
    const inputs = new Map<string, WormInput>([["w", { seq: 1, angle: 0.5, boost: false }]]);
    for (let t = 0; t < 300; t++) s.step(inputs, events);
    const removed = events.foodRemoved;
    expect(new Set(removed).size).toBe(removed.length);
    for (const id of removed) expect(s.world.food.has(id)).toBe(false);
  });
});

describe("collision & death", () => {
  it("head hitting another worm's body kills the runner, credits the victim's killer", () => {
    const s = sim(7, 6000);
    // b cruises straight; a starts behind it and boost-chases its tail
    const b = addWorm(s, "b", 1500, 3000, 0);
    const a = addWorm(s, "a", 1500 - 350, 3000, 0);
    a.mass = 100; // enough boost fuel for the chase
    const events = emptyEvents();
    for (let t = 0; t < 600 && a.alive; t++) {
      const chaseAngle = Math.atan2(b.y - a.y, b.x - a.x);
      const inputs = new Map<string, WormInput>([
        ["a", { seq: t, angle: chaseAngle, boost: true }],
        ["b", { seq: t, angle: 0, boost: false }],
      ]);
      s.step(inputs, events);
    }

    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    const death = events.deaths.find((d) => d.wormId === "a");
    expect(death?.killerId).toBe("b");
    expect(b.kills).toBe(1);
    expect(b.score).toBeGreaterThanOrEqual(SCORE.perKill);
  });

  it("death drops loot along the corpse", () => {
    const s = sim(9, 6000);
    const a = addWorm(s, "a", 3000, 3000, 0);
    a.mass = 100;
    const events: StepEvents = emptyEvents();
    // drive into the wall
    const inputs = new Map<string, WormInput>([["a", { seq: 1, angle: 0, boost: true }]]);
    for (let t = 0; t < 60 * 30 && a.alive; t++) s.step(inputs, events);
    expect(a.alive).toBe(false);
    const loot = events.foodSpawned.filter((f) => f.kind === "DEATH_LOOT");
    const expectedCount = Math.max(
      1,
      Math.floor((a.mass * FOOD_RULES.deathDropFraction) / FOOD.DEATH_LOOT.value),
    );
    expect(loot.length).toBe(expectedCount);
  });

  it("two heads meeting head-on both die", () => {
    const s = sim(11, 6000);
    const a = addWorm(s, "a", 2800, 3000, 0);
    const b = addWorm(s, "b", 3200, 3000, Math.PI);
    const inputs = new Map<string, WormInput>([
      ["a", { seq: 1, angle: 0, boost: false }],
      ["b", { seq: 1, angle: Math.PI, boost: false }],
    ]);
    const events = emptyEvents();
    for (let t = 0; t < 300 && (a.alive || b.alive); t++) s.step(inputs, events);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    expect(events.deaths.map((d) => d.wormId).sort()).toEqual(["a", "b"]);
  });

  it("a worm does not collide with itself", () => {
    const s = sim(13, 6000);
    const a = addWorm(s, "a", 3000, 3000, 0);
    a.mass = 200; // long body
    // steer in a tight circle — own body is right there, must not kill
    for (let t = 0; t < 600 && a.alive; t++) {
      const angle = (t / 60) * Math.PI * 2;
      const inputs = new Map<string, WormInput>([["a", { seq: t, angle, boost: false }]]);
      s.step(inputs);
    }
    expect(a.alive).toBe(true);
  });
});

describe("simulation determinism", () => {
  it("two sims with the same seed and inputs stay identical", () => {
    const s1 = sim(99, 4000);
    const s2 = sim(99, 4000);
    addWorm(s1, "w", 2000, 2000);
    addWorm(s2, "w", 2000, 2000);
    for (let t = 0; t < 600; t++) {
      const inputs = new Map<string, WormInput>([
        ["w", { seq: t, angle: Math.sin(t / 40) * 2, boost: t % 90 < 20 }],
      ]);
      s1.step(inputs);
      s2.step(inputs);
    }
    const w1 = s1.world.worms.get("w")!;
    const w2 = s2.world.worms.get("w")!;
    expect(w1.x).toBe(w2.x);
    expect(w1.y).toBe(w2.y);
    expect(w1.mass).toBe(w2.mass);
    expect(s1.world.food.size).toBe(s2.world.food.size);
  });
});
