import { SIM } from "@nibblio/config";
import { applyInput, createWorm, refreshDerived, stepWormMovement } from "@nibblio/game-core";
import type { WormInput, WormState } from "@nibblio/game-core";
import { angleDelta, wrapAngle } from "@nibblio/shared";

/** Client-side prediction for the local worm (spec §26, docs/NETWORKING.md).
 *
 *  The predictor runs the SAME game-core movement code as the server at the
 *  same fixed dt. Inputs are buffered until the server acknowledges them via
 *  lastInputSeq; on each authoritative update we rewind to the server state
 *  and replay the unacknowledged inputs, then surface any residual error as a
 *  smoothly-decaying render offset instead of a snap. */

export interface AuthoritativeWormUpdate {
  x: number;
  y: number;
  angle: number;
  mass: number;
  boosting: boolean;
  alive: boolean;
  lastInputSeq: number;
}

export class LocalPredictor {
  /** Predicted worm state (game-core replica). */
  readonly worm: WormState;
  private pending: WormInput[] = [];
  private accumulator = 0;
  /** Render-error offset, decays toward zero. */
  private errX = 0;
  private errY = 0;
  private errAngle = 0;
  /** Diagnostics (dev panel). */
  lastErrorMagnitude = 0;

  constructor(spawnX: number, spawnY: number, angle: number) {
    this.worm = createWorm({
      id: "local", ownerId: "local", nickname: "", skinId: "s0",
      x: spawnX, y: spawnY, angle, spawnTick: 0,
    });
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Advance prediction by render-frame delta, generating fixed steps.
   *  `makeInput` is called once per fixed step to sample current intent.
   *  Returns the inputs generated this frame (caller sends them to the server). */
  advance(dtSec: number, makeInput: () => WormInput): WormInput[] {
    const made: WormInput[] = [];
    this.accumulator += Math.min(dtSec, 0.25);
    while (this.accumulator >= SIM.dt) {
      this.accumulator -= SIM.dt;
      const input = makeInput();
      this.pending.push(input);
      applyInput(this.worm, input);
      stepWormMovement(this.worm, 0);
      made.push(input);
    }
    // decay the render error offset (~90 ms half-life)
    const decay = Math.pow(0.5, dtSec / 0.09);
    this.errX *= decay;
    this.errY *= decay;
    this.errAngle *= decay;
    return made;
  }

  /** Reconcile against an authoritative server update. */
  reconcile(update: AuthoritativeWormUpdate): void {
    // remember where prediction thought we were (for error smoothing)
    const prevX = this.worm.x;
    const prevY = this.worm.y;
    const prevAngle = this.worm.angle;

    // rewind to server truth
    this.worm.x = update.x;
    this.worm.y = update.y;
    this.worm.angle = update.angle;
    this.worm.targetAngle = update.angle;
    this.worm.mass = update.mass;
    this.worm.alive = update.alive;
    refreshDerived(this.worm);

    // drop acknowledged inputs, replay the rest
    this.pending = this.pending.filter((i) => i.seq > update.lastInputSeq);
    for (const input of this.pending) {
      applyInput(this.worm, input);
      stepWormMovement(this.worm, 0);
    }

    // residual error → smooth offset (rendered position = predicted + err)
    this.errX = prevX - this.worm.x + this.errX;
    this.errY = prevY - this.worm.y + this.errY;
    this.errAngle = wrapAngle(angleDelta(this.worm.angle, prevAngle) + this.errAngle);
    this.lastErrorMagnitude = Math.hypot(prevX - this.worm.x, prevY - this.worm.y);

    // hard snap if desync is extreme (teleport/respawn)
    if (Math.hypot(this.errX, this.errY) > 400) {
      this.errX = 0;
      this.errY = 0;
      this.errAngle = 0;
    }
  }

  /** Position/angle to RENDER this frame (prediction + decaying error offset). */
  renderPose(): { x: number; y: number; angle: number } {
    return {
      x: this.worm.x + this.errX,
      y: this.worm.y + this.errY,
      angle: wrapAngle(this.worm.angle + this.errAngle),
    };
  }
}
