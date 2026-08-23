/** Fixed-capacity ring buffer — used for worm path samples and input queues
 *  without per-frame allocation (spec §102). */
export class RingBuffer<T> {
  private readonly buf: (T | undefined)[];
  private head = 0; // next write position
  private count = 0;

  constructor(public readonly capacity: number) {
    if (capacity <= 0) throw new Error("RingBuffer capacity must be > 0");
    this.buf = new Array<T | undefined>(capacity);
  }

  get length(): number {
    return this.count;
  }

  /** Append newest element, evicting the oldest when full. */
  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** i = 0 → newest, i = length-1 → oldest. */
  fromNewest(i: number): T {
    if (i < 0 || i >= this.count) throw new RangeError(`index ${i} out of range 0..${this.count - 1}`);
    const idx = (this.head - 1 - i + this.capacity * 2) % this.capacity;
    return this.buf[idx] as T;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buf.fill(undefined);
  }
}
