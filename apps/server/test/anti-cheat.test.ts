import { describe, expect, it } from "vitest";
import { VALIDATION } from "@nibblio/config";
import { InputGuard, massGainAllowed } from "../src/anti-cheat.js";

const good = (seq: number) => ({ seq, angle: 1.2, boost: false });

describe("InputGuard", () => {
  it("accepts well-formed sequential inputs", () => {
    const g = new InputGuard();
    expect(g.check(good(1), 0).ok).toBe(true);
    expect(g.check(good(2), 50).ok).toBe(true);
    expect(g.rejected).toBe(0);
  });

  it("rejects malformed payloads", () => {
    const g = new InputGuard();
    for (const bad of [
      null, {}, { seq: "1", angle: 0, boost: false },
      { seq: 1, angle: NaN, boost: false },
      { seq: 1, angle: Infinity, boost: false },
      { seq: 1, angle: 0, boost: "yes" },
      { seq: -5, angle: 0, boost: false },
    ]) {
      expect(g.check(bad, 0).ok).toBe(false);
    }
    expect(g.rejected).toBe(7);
  });

  it("rate-limits flooding within a 1s window", () => {
    const g = new InputGuard();
    let accepted = 0;
    for (let i = 1; i <= 200; i++) {
      if (g.check(good(i), 10).ok) accepted++;
    }
    expect(accepted).toBe(VALIDATION.maxInputRate);
  });

  it("window resets after a second — honest clients recover", () => {
    const g = new InputGuard();
    for (let i = 1; i <= 100; i++) g.check(good(i), 10);
    expect(g.check(good(101), 1100).ok).toBe(true);
  });

  it("rejects sequence regression (replay)", () => {
    const g = new InputGuard();
    expect(g.check(good(10), 0).ok).toBe(true);
    expect(g.check(good(5), 40).ok).toBe(false);
    expect(g.check(good(5), 40).reason).toBe("sequence");
    expect(g.check(good(11), 80).ok).toBe(true);
  });

  it("sustained abuse triggers a temporary mute, then recovers", () => {
    const g = new InputGuard();
    // 30 malformed strikes → mute
    for (let i = 0; i < 30; i++) g.check(null, i);
    expect(g.check(good(1), 100).ok).toBe(false);
    expect(g.check(good(1), 100).reason).toBe("rate");
    // after the mute window the guard accepts again
    expect(g.check(good(2), 6000).ok).toBe(true);
  });
});

describe("massGainAllowed", () => {
  it("allows losses and reasonable gains", () => {
    expect(massGainAllowed(100, 90, 0.05)).toBe(true);
    expect(massGainAllowed(100, 105, 0.05)).toBe(true);
  });
  it("flags absurd instantaneous gains", () => {
    expect(massGainAllowed(100, 100 + VALIDATION.maxMassGainPerSec * 2, 0.05)).toBe(false);
  });
});
