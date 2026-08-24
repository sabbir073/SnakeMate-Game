/** Render-side head-path recorder (mirrors game-core's path model).
 *
 *  Body segments are sampled from the head's actual trajectory at fixed
 *  arc-length spacing — NOT chained follow-the-leader. Chain-following
 *  freezes inner links when the chain compresses, which visibly "sticks" the
 *  tail whenever the worm coils in a circle; path sampling makes the whole
 *  body flow through the loop exactly like the authoritative sim does. */

export interface PathPoint {
  x: number;
  y: number;
}

const SPACING = 8; // wu between recorded samples (render resolution)

export class PathTracker {
  /** samples[0] is the most recent point behind the head. */
  private samples: PathPoint[] = [];
  private accum = 0;
  private lastX = 0;
  private lastY = 0;
  private seeded = false;

  /** (Re)seed the path straight behind a pose — spawn/respawn/teleport. */
  reset(x: number, y: number, angle: number, bodyLength: number): void {
    this.samples.length = 0;
    this.accum = 0;
    this.lastX = x;
    this.lastY = y;
    const dx = -Math.cos(angle) * SPACING;
    const dy = -Math.sin(angle) * SPACING;
    const n = Math.ceil(bodyLength / SPACING) + 2;
    let px = x;
    let py = y;
    for (let i = 0; i < n; i++) {
      px += dx;
      py += dy;
      this.samples.push({ x: px, y: py });
    }
    this.seeded = true;
  }

  /** Feed the rendered head pose once per frame. */
  record(x: number, y: number, angle: number, maxBodyLength: number): void {
    if (!this.seeded) {
      this.reset(x, y, angle, maxBodyLength);
      return;
    }
    const moved = Math.hypot(x - this.lastX, y - this.lastY);
    // teleport guard (respawn without reset, huge reconcile snap)
    if (moved > 320) {
      this.reset(x, y, angle, maxBodyLength);
      return;
    }
    this.lastX = x;
    this.lastY = y;
    this.accum += moved;
    while (this.accum >= SPACING) {
      this.accum -= SPACING;
      // the crossing point sits accum wu behind the current head
      this.samples.unshift({
        x: x - Math.cos(angle) * this.accum,
        y: y - Math.sin(angle) * this.accum,
      });
    }
    const maxNeeded = Math.ceil(maxBodyLength / SPACING) + 2;
    if (this.samples.length > maxNeeded) this.samples.length = maxNeeded;
  }

  /** Body position `dist` wu behind the head (head pose passed for the
   *  segment between head and first sample). */
  pointAt(dist: number, headX: number, headY: number, out: PathPoint): void {
    if (dist <= 0 || this.samples.length === 0) {
      out.x = headX;
      out.y = headY;
      return;
    }
    const first = this.samples[0]!;
    if (dist <= this.accum || this.samples.length === 1) {
      const t = this.accum > 1e-6 ? dist / this.accum : 1;
      out.x = headX + (first.x - headX) * Math.min(t, 1);
      out.y = headY + (first.y - headY) * Math.min(t, 1);
      return;
    }
    const remaining = dist - this.accum;
    const idx = Math.floor(remaining / SPACING);
    const frac = remaining / SPACING - idx;
    const a = this.samples[Math.min(idx, this.samples.length - 1)]!;
    const b = this.samples[Math.min(idx + 1, this.samples.length - 1)]!;
    out.x = a.x + (b.x - a.x) * frac;
    out.y = a.y + (b.y - a.y) * frac;
  }
}
