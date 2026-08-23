import { NET } from "@nibblio/config";
import { lerp, lerpAngle } from "@nibblio/shared";

/** Snapshot interpolation for remote entities (spec §27).
 *  Buffers timestamped authoritative states and renders the entity at
 *  `now − interpolationDelay`, between the two surrounding snapshots. */

export interface Snapshot {
  t: number; // client receipt time (ms)
  x: number;
  y: number;
  angle: number;
  mass: number;
  boosting: boolean;
  alive: boolean;
}

const MAX_SNAPSHOTS = 12;

export class SnapshotBuffer {
  private snaps: Snapshot[] = [];

  push(s: Snapshot): void {
    this.snaps.push(s);
    if (this.snaps.length > MAX_SNAPSHOTS) this.snaps.shift();
  }

  get interpolationDelayMs(): number {
    return (1000 / NET.snapshotRate) * NET.interpolationIntervals;
  }

  /** Sample the buffered timeline at `nowMs − delay`.
   *  Falls back to the newest snapshot (capped extrapolation) when behind. */
  sample(nowMs: number): Snapshot | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    const renderT = nowMs - this.interpolationDelayMs;

    const newest = this.snaps[n - 1]!;
    const oldest = this.snaps[0]!;
    if (renderT <= oldest.t) return oldest;
    if (renderT >= newest.t) {
      // snapshot late — hold the newest (no unbounded extrapolation)
      return newest;
    }
    for (let i = n - 2; i >= 0; i--) {
      const a = this.snaps[i]!;
      const b = this.snaps[i + 1]!;
      if (renderT >= a.t && renderT <= b.t) {
        const span = b.t - a.t;
        const u = span > 0 ? (renderT - a.t) / span : 1;
        return {
          t: renderT,
          x: lerp(a.x, b.x, u),
          y: lerp(a.y, b.y, u),
          angle: lerpAngle(a.angle, b.angle, u),
          mass: lerp(a.mass, b.mass, u),
          boosting: b.boosting,
          alive: b.alive,
        };
      }
    }
    return newest;
  }

  clear(): void {
    this.snaps.length = 0;
  }
}
