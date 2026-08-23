/** Uniform-grid spatial hash (spec §20, §103).
 *  Broad phase for collision, food pickup, and AOI queries.
 *  Keys are packed cell coords; values are entity id sets.
 *  Deterministic: query results are returned in insertion order per cell,
 *  and callers that need global determinism sort by id.
 */

export class SpatialHash {
  private cells = new Map<number, Set<number>>();
  /** id → packed cell key (for O(1) update/remove). */
  private where = new Map<number, number>();

  constructor(public readonly cellSize: number) {
    if (cellSize <= 0) throw new Error("cellSize must be > 0");
  }

  private key(cx: number, cy: number): number {
    // pack two signed 16-bit-ish cell coords into one number
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  private cellOf(x: number, y: number): number {
    return this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  insert(id: number, x: number, y: number): void {
    const k = this.cellOf(x, y);
    let set = this.cells.get(k);
    if (!set) {
      set = new Set();
      this.cells.set(k, set);
    }
    set.add(id);
    this.where.set(id, k);
  }

  remove(id: number): void {
    const k = this.where.get(id);
    if (k === undefined) return;
    const set = this.cells.get(k);
    if (set) {
      set.delete(id);
      if (set.size === 0) this.cells.delete(k);
    }
    this.where.delete(id);
  }

  update(id: number, x: number, y: number): void {
    const k = this.cellOf(x, y);
    const prev = this.where.get(id);
    if (prev === k) return;
    this.remove(id);
    this.insert(id, x, y);
  }

  /** Collect candidate ids within `radius` of (x, y) into `out` (cleared first).
   *  Broad phase only — callers do the narrow-phase distance check. */
  queryRadius(x: number, y: number, radius: number, out: number[]): number[] {
    out.length = 0;
    const s = this.cellSize;
    const minX = Math.floor((x - radius) / s);
    const maxX = Math.floor((x + radius) / s);
    const minY = Math.floor((y - radius) / s);
    const maxY = Math.floor((y + radius) / s);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const set = this.cells.get(this.key(cx, cy));
        if (set) for (const id of set) out.push(id);
      }
    }
    return out;
  }

  queryAABB(x0: number, y0: number, x1: number, y1: number, out: number[]): number[] {
    out.length = 0;
    const s = this.cellSize;
    const minX = Math.floor(x0 / s);
    const maxX = Math.floor(x1 / s);
    const minY = Math.floor(y0 / s);
    const maxY = Math.floor(y1 / s);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const set = this.cells.get(this.key(cx, cy));
        if (set) for (const id of set) out.push(id);
      }
    }
    return out;
  }

  clear(): void {
    this.cells.clear();
    this.where.clear();
  }

  get size(): number {
    return this.where.size;
  }
}
