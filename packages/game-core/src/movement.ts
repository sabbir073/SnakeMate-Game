import { BOOST, POWERUP_RULES, SIM, WORM } from "@nibblio/config";
import { boundedTurn, clamp, wrapAngle } from "@nibblio/shared";
import type { WormInput, WormState } from "./types.js";
import { recordPath, refreshDerived } from "./worm.js";

/** Apply an input intention to a worm (validation happens server-side before
 *  this is called; the client calls it directly for prediction). */
export function applyInput(w: WormState, input: WormInput): void {
  w.targetAngle = wrapAngle(input.angle);
  w.boosting = input.boost && w.mass > BOOST.minMassToBoost;
  if (input.seq > w.lastInputSeq) w.lastInputSeq = input.seq;
}

/** Integrate one fixed timestep of motion for a single worm.
 *  Deterministic: same state + same input ⇒ same result, bit-for-bit.
 *  Returns distance moved (wu). */
export function stepWormMovement(w: WormState, tick: number): number {
  if (!w.alive) return 0;
  const dt = SIM.dt;

  // steering with mass-scaled turn rate limit (spec §16)
  const turnRate =
    WORM.turnRateMax +
    (WORM.turnRateMin - WORM.turnRateMax) *
      clamp((w.mass - WORM.spawnMass) / (WORM.turnRateMassRef - WORM.spawnMass), 0, 1);
  w.angle = boundedTurn(w.angle, w.targetAngle, turnRate * dt);

  // speed: base × boost × powerup
  let speed = WORM.baseSpeed;
  if (w.boosting) speed *= WORM.boostMultiplier;
  if ((w.effects.SPEED ?? 0) > tick) speed *= POWERUP_RULES.speedMultiplier;
  w.speed = speed;

  const moved = speed * dt;
  w.x += Math.cos(w.angle) * moved;
  w.y += Math.sin(w.angle) * moved;
  recordPath(w, moved);

  // boost cost: proportional drain (wormate-style), floor at minMass;
  // auto-cancel only when truly spawn-sized
  if (w.boosting) {
    let drain =
      Math.max(BOOST.massDrainMinPerSec, w.mass * BOOST.massDrainFracPerSec) * dt;
    if ((w.effects.BOOST_REDUCTION ?? 0) > tick) drain *= POWERUP_RULES.boostDrainReduction;
    const newMass = Math.max(WORM.minMass, w.mass - drain);
    if (newMass !== w.mass) {
      w.mass = newMass;
      refreshDerived(w);
    }
    if (w.mass <= WORM.minMass) w.boosting = false;
    w.boostDropAccum += dt;
  } else {
    w.boostDropAccum = 0;
  }

  return moved;
}
