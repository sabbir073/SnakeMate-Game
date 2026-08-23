/** Angle & vector math used across simulation, prediction, and rendering.
 *  Everything here must be pure and deterministic. */

export const TWO_PI = Math.PI * 2;

/** Normalize an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = a % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  else if (a <= -Math.PI) a += TWO_PI;
  return a;
}

/** Signed shortest angular difference target − current, in (-π, π]. */
export function angleDelta(current: number, target: number): number {
  return wrapAngle(target - current);
}

/** Rotate `current` toward `target` by at most `maxStep` (radians). */
export function boundedTurn(current: number, target: number, maxStep: number): number {
  const d = angleDelta(current, target);
  if (d > maxStep) return wrapAngle(current + maxStep);
  if (d < -maxStep) return wrapAngle(current - maxStep);
  return wrapAngle(target);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate between two angles along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + angleDelta(a, b) * t);
}

export function dist2(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(dist2(x1, y1, x2, y2));
}

/** Squared distance from point P to segment AB — capsule narrow-phase primitive. */
export function pointSegmentDist2(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return apx * apx + apy * apy;
  let t = (apx * abx + apy * aby) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return dist2(px, py, cx, cy);
}
