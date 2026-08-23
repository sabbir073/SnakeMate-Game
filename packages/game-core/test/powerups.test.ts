import { describe, expect, it } from "vitest";
import { POWERUPS, POWERUP_RULES, SIM, WORM } from "@nibblio/config";
import { createRng } from "@nibblio/shared";
import {
  Simulation, createWorm, emptyEvents, grantEffect, targetPowerupCount, activeEffects,
} from "../src/index.js";
import type { WormInput } from "../src/index.js";

function sim(seed = 5, size = 4000): Simulation {
  return new Simulation(createRng(seed), size);
}

function addWorm(s: Simulation, id: string, x: number, y: number, angle = 0) {
  const w = createWorm({
    id, ownerId: id, nickname: id, skinId: "s0", x, y, angle, spawnTick: 0,
  });
  s.addWorm(w);
  return w;
}

const noInputs = new Map<string, WormInput>();

describe("powerups", () => {
  it("world replenishes toward the player-scaled target", () => {
    const s = sim();
    addWorm(s, "p1", 2000, 2000);
    const events = emptyEvents();
    s.step(noInputs, events);
    expect(s.world.powerups.size).toBe(targetPowerupCount(1));
    expect(events.powerupsSpawned.length).toBeGreaterThan(0);
  });

  it("no powerups spawn in an empty world", () => {
    const s = sim();
    s.step(noInputs);
    expect(s.world.powerups.size).toBe(0);
  });

  it("pickup grants a timed effect and removes the pickup", () => {
    const s = sim();
    const w = addWorm(s, "p1", 2000, 2000);
    s.step(noInputs);
    // teleport a powerup onto the worm's path
    const p = [...s.world.powerups.values()][0]!;
    p.x = w.x + 30;
    p.y = w.y;
    const events = emptyEvents();
    const inputs = new Map<string, WormInput>([["p1", { seq: 1, angle: 0, boost: false }]]);
    for (let t = 0; t < 30 && events.powerupsTaken.length === 0; t++) s.step(inputs, events);
    expect(events.powerupsTaken.length).toBe(1);
    expect(s.world.powerups.has(p.id)).toBe(false);
    expect(activeEffects(s.world, w)).toContain(events.powerupsTaken[0]!.kind);
  });

  it("SPEED effect makes the worm faster; expires after duration", () => {
    const a = sim(21);
    const b = sim(21);
    const wa = addWorm(a, "w", 500, 2000);
    const wb = addWorm(b, "w", 500, 2000);
    grantEffect(a.world, wa, "SPEED");
    const inputs = new Map<string, WormInput>([["w", { seq: 1, angle: 0, boost: false }]]);
    const ticks = Math.round(POWERUPS.SPEED.durationSec * SIM.tickRate) - 5;
    for (let t = 0; t < ticks; t++) {
      a.step(inputs);
      b.step(inputs);
    }
    expect(wa.x - 500).toBeCloseTo((wb.x - 500) * POWERUP_RULES.speedMultiplier, 0);
    // after expiry speeds equalize
    for (let t = 0; t < 10; t++) a.step(inputs);
    expect(wa.speed).toBeCloseTo(WORM.baseSpeed);
    expect(activeEffects(a.world, wa)).not.toContain("SPEED");
  });

  it("MAGNET pulls nearby food toward the worm", () => {
    const s = sim(31);
    const w = addWorm(s, "w", 2000, 2000);
    grantEffect(s.world, w, "MAGNET");
    // let food spawn, find one within magnet radius but outside pickup
    for (let t = 0; t < 300; t++) s.step(noInputs);
    const candidates = [...s.world.food.values()].filter((f) => {
      const d = Math.hypot(f.x - w.x, f.y - w.y);
      return d > 80 && d < 200;
    });
    expect(candidates.length).toBeGreaterThan(0);
    const f = candidates[0]!;
    const dBefore = Math.hypot(f.x - w.x, f.y - w.y);
    s.step(noInputs);
    const dAfter = Math.hypot(f.x - w.x, f.y - w.y);
    // worm also moves, but pull speed (700) far exceeds worm speed (180)
    expect(dAfter).toBeLessThan(dBefore);
  });

  it("DOUBLE_GROWTH doubles mass gain from food", () => {
    const s = sim(41);
    const w = addWorm(s, "w", 2000, 2000);
    grantEffect(s.world, w, "DOUBLE_GROWTH");
    for (let t = 0; t < 400; t++) s.step(noInputs);
    const massBefore = w.mass;
    const events = emptyEvents();
    const inputs = new Map<string, WormInput>([["w", { seq: 1, angle: 0.8, boost: false }]]);
    for (let t = 0; t < 200 && events.foodEaten.length === 0; t++) s.step(inputs, events);
    expect(events.foodEaten.length).toBeGreaterThan(0);
    const eatenValue = events.foodEaten.reduce((sum, e) => sum + e.value, 0);
    expect(w.mass - massBefore).toBeCloseTo(eatenValue * 2, 5);
  });

  it("re-pickup extends the effect expiry", () => {
    const s = sim(51);
    const w = addWorm(s, "w", 2000, 2000);
    grantEffect(s.world, w, "SHIELD");
    const first = w.effects.SHIELD!;
    grantEffect(s.world, w, "SHIELD");
    expect(w.effects.SHIELD!).toBeGreaterThan(first);
  });
});

describe("shield", () => {
  it("blocks one collision death and is consumed", () => {
    const s = sim(61, 6000);
    const b = addWorm(s, "b", 1500, 3000, 0);
    const a = addWorm(s, "a", 1150, 3000, 0);
    a.mass = 100;
    grantEffect(s.world, a, "SHIELD");
    let survivedContact = false;
    for (let t = 0; t < 240 && a.alive; t++) {
      const chase = Math.atan2(b.y - a.y, b.x - a.x);
      const inputs = new Map<string, WormInput>([
        ["a", { seq: t, angle: chase, boost: true }],
        ["b", { seq: t, angle: 0, boost: false }],
      ]);
      s.step(inputs);
      if (a.alive && a.effects.SHIELD === undefined) survivedContact = true;
    }
    // shield consumed on first contact while still alive at that moment
    expect(survivedContact).toBe(true);
    // continuing the chase without shield eventually kills
    for (let t = 0; t < 600 && a.alive; t++) {
      const chase = Math.atan2(b.y - a.y, b.x - a.x);
      const inputs = new Map<string, WormInput>([
        ["a", { seq: 1000 + t, angle: chase, boost: true }],
        ["b", { seq: 1000 + t, angle: 0, boost: false }],
      ]);
      s.step(inputs);
    }
    expect(a.alive).toBe(false);
  });
});
