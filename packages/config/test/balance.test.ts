import { describe, expect, it } from "vitest";
import { SIM, WORLD, WORM, FOOD, POWERUPS, ROOM, VALIDATION, BOOST } from "../src/index.js";

describe("balance sanity invariants", () => {
  it("fixed timestep matches tick rate", () => {
    expect(SIM.dt * SIM.tickRate).toBeCloseTo(1);
  });
  it("world size within spec ceiling", () => {
    expect(WORLD.size).toBeLessThanOrEqual(WORLD.maxSize);
    expect(WORLD.size).toBeGreaterThan(0);
  });
  it("worm can always exist at min mass", () => {
    expect(WORM.minMass).toBeLessThanOrEqual(WORM.spawnMass);
    expect(BOOST.minMassToBoost).toBeGreaterThanOrEqual(WORM.minMass);
  });
  it("turn rate shrinks but never inverts", () => {
    expect(WORM.turnRateMin).toBeGreaterThan(0);
    expect(WORM.turnRateMax).toBeGreaterThanOrEqual(WORM.turnRateMin);
  });
  it("every food kind has positive value and radius", () => {
    for (const f of Object.values(FOOD)) {
      expect(f.value).toBeGreaterThan(0);
      expect(f.radius).toBeGreaterThan(0);
    }
  });
  it("ambient food spawn weights exclude DEATH_LOOT", () => {
    expect(FOOD.DEATH_LOOT.spawnWeight).toBe(0);
  });
  it("powerups all have durations", () => {
    for (const p of Object.values(POWERUPS)) expect(p.durationSec).toBeGreaterThan(0);
  });
  it("room within spec range", () => {
    expect(ROOM.maxPlayers).toBeGreaterThanOrEqual(25);
    expect(ROOM.maxPlayers).toBeLessThanOrEqual(50);
  });
  it("anti-cheat tolerances are lenient (> 1) so latency is never punished", () => {
    expect(VALIDATION.speedTolerance).toBeGreaterThan(1);
    expect(VALIDATION.turnTolerance).toBeGreaterThan(1);
    expect(VALIDATION.pickupDistanceTolerance).toBeGreaterThan(1);
  });
});
