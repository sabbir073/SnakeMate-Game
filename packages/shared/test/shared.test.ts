import { describe, expect, it } from "vitest";
import {
  boundedTurn, wrapAngle, angleDelta, lerpAngle, pointSegmentDist2,
  createRng, hashString, RingBuffer, clamp,
} from "../src/index.js";

describe("angle math", () => {
  it("wraps into (-π, π]", () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });

  it("angleDelta takes the shortest arc", () => {
    expect(angleDelta(-3, 3)).toBeCloseTo(-(2 * Math.PI - 6));
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2);
  });

  it("boundedTurn clamps turn rate and crosses the ±π seam", () => {
    // near the seam: turning from just below π to just above -π is a small step
    const cur = Math.PI - 0.05;
    const target = -Math.PI + 0.05;
    const out = boundedTurn(cur, target, 0.2);
    expect(Math.abs(angleDelta(out, target))).toBeLessThan(1e-9);
    // clamped case
    const out2 = boundedTurn(0, Math.PI / 2, 0.1);
    expect(out2).toBeCloseTo(0.1);
  });

  it("lerpAngle interpolates across the seam", () => {
    const mid = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(1e-9);
  });
});

describe("pointSegmentDist2", () => {
  it("projects onto the segment interior", () => {
    expect(pointSegmentDist2(0, 1, -1, 0, 1, 0)).toBeCloseTo(1);
  });
  it("clamps to endpoints", () => {
    expect(pointSegmentDist2(3, 0, -1, 0, 1, 0)).toBeCloseTo(4);
  });
  it("handles degenerate zero-length segments", () => {
    expect(pointSegmentDist2(3, 4, 0, 0, 0, 0)).toBeCloseTo(25);
  });
});

describe("seeded rng", () => {
  it("is deterministic per seed", () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it("differs across seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it("int stays in range inclusively", () => {
    const r = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
  it("weighted respects zero weights", () => {
    const r = createRng(7);
    for (let i = 0; i < 200; i++) {
      expect(r.weighted([0, 1, 0])).toBe(1);
    }
  });
  it("hashString is stable", () => {
    expect(hashString("nibblio")).toBe(hashString("nibblio"));
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("RingBuffer", () => {
  it("evicts oldest and indexes from newest", () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1); rb.push(2); rb.push(3); rb.push(4);
    expect(rb.length).toBe(3);
    expect(rb.fromNewest(0)).toBe(4);
    expect(rb.fromNewest(2)).toBe(2);
    expect(() => rb.fromNewest(3)).toThrow();
  });
});

describe("clamp", () => {
  it("clamps", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
