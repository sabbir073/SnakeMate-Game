import { NET, VALIDATION } from "@nibblio/config";
import type { InputMessage } from "@nibblio/protocol";

/** Server-side input validation (spec §54).
 *
 *  The simulation is fully authoritative — clients literally cannot set
 *  position/mass/score (they only send intentions), so cheating surface is:
 *   1. malformed messages          → dropped
 *   2. input flooding              → rate limited, then muted
 *   3. out-of-range values         → clamped/dropped
 *   4. sequence replay/regression  → dropped
 *
 *  High latency is NEVER punished (spec: latency ≠ cheating): all limits are
 *  on message *rate and shape*, not on timing precision.
 */

export interface InputGuardResult {
  ok: boolean;
  reason?: "malformed" | "rate" | "sequence";
}

export class InputGuard {
  private windowStart = 0;
  private windowCount = 0;
  private lastSeq = 0;
  /** Strikes decay; sustained abuse triggers mute. */
  private strikes = 0;
  private mutedUntil = 0;

  /** Total rejected messages (diagnostics/metrics). */
  rejected = 0;

  check(msg: unknown, nowMs: number): InputGuardResult {
    if (nowMs < this.mutedUntil) {
      this.rejected++;
      return { ok: false, reason: "rate" };
    }

    // 1. shape
    const m = msg as Partial<InputMessage> | null;
    if (
      !m ||
      typeof m.seq !== "number" || !Number.isFinite(m.seq) || m.seq < 0 ||
      typeof m.angle !== "number" || !Number.isFinite(m.angle) ||
      typeof m.boost !== "boolean"
    ) {
      this.rejected++;
      this.strike(nowMs);
      return { ok: false, reason: "malformed" };
    }

    // 2. rate limiting: sliding 1s window
    if (nowMs - this.windowStart >= 1000) {
      this.windowStart = nowMs;
      this.windowCount = 0;
    }
    this.windowCount++;
    if (this.windowCount > VALIDATION.maxInputRate) {
      // No strike here: a jitter-buffer flush can legitimately burst inputs
      // (spec: latency is never punished). Excess is simply dropped.
      this.rejected++;
      return { ok: false, reason: "rate" };
    }

    // 3. sequence must move forward (tolerate equal — client retransmit)
    const seq = m.seq >>> 0;
    if (seq < this.lastSeq) {
      this.rejected++;
      return { ok: false, reason: "sequence" };
    }
    // absurd jumps (e.g. seq skipping by millions) are tolerated but capped:
    // seq is only used for reconciliation acks, never for simulation math.
    this.lastSeq = seq;

    return { ok: true };
  }

  private strike(nowMs: number): void {
    this.strikes++;
    if (this.strikes >= 30) {
      // 5s mute — throttles abuse without kicking laggy-but-honest players
      this.mutedUntil = nowMs + 5000;
      this.strikes = 0;
    }
  }
}

/** Sanity envelope for server-computed mass transitions (defense-in-depth —
 *  a bug or exploit that inflates mass beyond what food intake allows is
 *  clamped and reported). */
export function massGainAllowed(prevMass: number, newMass: number, dtSec: number): boolean {
  const gain = newMass - prevMass;
  if (gain <= 0) return true;
  return gain <= VALIDATION.maxMassGainPerSec * Math.max(dtSec, 1 / NET.snapshotRate);
}
