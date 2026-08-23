import { WORM } from "@nibblio/config";
import { clamp } from "@nibblio/shared";
import type { PathSample, WormState } from "./types.js";

/** Derived attribute formulas — single source (spec §115 via config). */

export function radiusForMass(mass: number): number {
  return WORM.baseRadius * Math.pow(mass / WORM.spawnMass, WORM.radiusExp);
}

export function lengthForMass(mass: number): number {
  return WORM.baseLength + (mass - WORM.spawnMass) * WORM.lengthPerMass;
}

/** Turn rate decreases with mass: big worms steer like trucks. */
export function turnRateForMass(mass: number): number {
  const t = clamp((mass - WORM.spawnMass) / (WORM.turnRateMassRef - WORM.spawnMass), 0, 1);
  return WORM.turnRateMax + (WORM.turnRateMin - WORM.turnRateMax) * t;
}

export function createWorm(opts: {
  id: string;
  ownerId: string;
  nickname: string;
  skinId: string;
  x: number;
  y: number;
  angle: number;
  spawnTick: number;
}): WormState {
  const mass = WORM.spawnMass;
  const worm: WormState = {
    id: opts.id,
    ownerId: opts.ownerId,
    nickname: opts.nickname,
    skinId: opts.skinId,
    x: opts.x,
    y: opts.y,
    angle: opts.angle,
    targetAngle: opts.angle,
    speed: 0,
    boosting: false,
    radius: radiusForMass(mass),
    mass,
    score: 0,
    kills: 0,
    alive: true,
    spawnTick: opts.spawnTick,
    pathAccum: 0,
    path: [],
    length: lengthForMass(mass),
    boostDropAccum: 0,
    effects: {},
    lastInputSeq: 0,
  };
  // Seed the path backwards from the head so a fresh worm has a full body.
  seedPath(worm);
  return worm;
}

/** Fill the path history straight behind the head to cover the body length. */
export function seedPath(w: WormState): void {
  w.path.length = 0;
  const dx = -Math.cos(w.angle) * WORM.pathSpacing;
  const dy = -Math.sin(w.angle) * WORM.pathSpacing;
  const samples = Math.min(
    WORM.maxPathSamples,
    Math.ceil(w.length / WORM.pathSpacing) + 2,
  );
  let x = w.x;
  let y = w.y;
  for (let i = 0; i < samples; i++) {
    x += dx;
    y += dy;
    w.path.push({ x, y }); // index 0 = closest to head
  }
  w.pathAccum = 0;
}

/** Record head movement into the path at fixed arc-length spacing.
 *  path[0] is the most recent sample behind the head. */
export function recordPath(w: WormState, movedDist: number): void {
  w.pathAccum += movedDist;
  while (w.pathAccum >= WORM.pathSpacing) {
    w.pathAccum -= WORM.pathSpacing;
    // interpolate the sample position at the crossing point (behind current head)
    const backDist = w.pathAccum;
    const sx = w.x - Math.cos(w.angle) * backDist;
    const sy = w.y - Math.sin(w.angle) * backDist;
    w.path.unshift({ x: sx, y: sy });
    const maxNeeded = Math.min(
      WORM.maxPathSamples,
      Math.ceil(w.length / WORM.pathSpacing) + 2,
    );
    if (w.path.length > maxNeeded) w.path.length = maxNeeded;
  }
}

/** Position on the body at `distFromHead` wu behind the head.
 *  Used for rendering segments and for collision capsule checks. */
export function bodyPointAt(w: WormState, distFromHead: number, out: PathSample): void {
  if (distFromHead <= 0) {
    out.x = w.x;
    out.y = w.y;
    return;
  }
  // distance from head to path[0] is pathAccum, then pathSpacing between samples
  let remaining = distFromHead - w.pathAccum;
  if (remaining <= 0) {
    // between head and first sample
    const first = w.path[0];
    if (!first) { out.x = w.x; out.y = w.y; return; }
    const t = distFromHead / Math.max(w.pathAccum, 1e-6);
    out.x = w.x + (first.x - w.x) * t;
    out.y = w.y + (first.y - w.y) * t;
    return;
  }
  const spacing = WORM.pathSpacing;
  const idx = Math.floor(remaining / spacing);
  const frac = remaining / spacing - idx;
  const a = w.path[Math.min(idx, w.path.length - 1)];
  const b = w.path[Math.min(idx + 1, w.path.length - 1)];
  if (!a) { out.x = w.x; out.y = w.y; return; }
  if (!b || a === b) { out.x = a.x; out.y = a.y; return; }
  out.x = a.x + (b.x - a.x) * frac;
  out.y = a.y + (b.y - a.y) * frac;
}

/** Update cached derived attributes after mass changes. */
export function refreshDerived(w: WormState): void {
  w.radius = radiusForMass(w.mass);
  w.length = lengthForMass(w.mass);
}
