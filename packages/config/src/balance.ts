/** ─── BALANCE — the single source of every gameplay tuning value ───────────
 *  Spec §115: never spread numbers through code. Everything the simulation,
 *  server validation, or client feel depends on lives here.
 *  Units: world units (wu), seconds, radians, mass points.
 */

export const SIM = {
  /** Fixed simulation rate (Hz). game-core integrates at exactly this dt. */
  tickRate: 60,
  /** Fixed timestep in seconds. */
  dt: 1 / 60,
} as const;

export const NET = {
  /** Server → client snapshot publish rate (Hz). */
  snapshotRate: 20,
  /** Max client input messages per second accepted. */
  inputRate: 30,
  /** Remote-entity render delay, in snapshot intervals. */
  interpolationIntervals: 1.5,
  /** Reconnect grace window (seconds) during which a dropped worm survives. */
  reconnectGraceSec: 20,
  /** AOI cell size (wu) for interest management (M3). */
  aoiCellSize: 1600,
  /** Food visibility radius per client (wu) — covers a 4K viewport at min zoom. */
  aoiFoodRadius: 2400,
  /** AOI membership refresh interval, in sim ticks (6 = 10 Hz). */
  aoiRefreshTicks: 6,
  /** Network quality thresholds (ms RTT / ms jitter). */
  quality: {
    excellent: { ping: 80, jitter: 20 },
    good: { ping: 180, jitter: 60 },
    // above "good" → poor; no socket → reconnecting
  },
} as const;

export const WORLD = {
  /** Playable square world edge length (wu). Spec ceiling is 100000. */
  size: 10000,
  /** Hard ceiling from spec §21 — config may raise size up to this. */
  maxSize: 100000,
  /** Radius of the soft boundary band where worms are turned back / die. */
  boundaryKillsAt: 0, // distance beyond edge that kills (0 = touching edge)
} as const;

export const WORM = {
  /** Base cruise speed (wu/s). */
  baseSpeed: 180,
  /** Boost speed multiplier. */
  boostMultiplier: 1.8,
  /** Max turn rate at minimum mass (rad/s). */
  turnRateMax: 4.4,
  /** Turn rate floor for huge worms (rad/s). */
  turnRateMin: 1.6,
  /** Mass at which turn rate reaches its floor. */
  turnRateMassRef: 500,
  /** Starting mass. */
  spawnMass: 10,
  /** Minimum mass — boost can never shrink below this. */
  minMass: 10,
  /** Head radius at spawn mass (wu). */
  baseRadius: 14,
  /** Radius growth: radius = baseRadius * (mass / spawnMass) ^ radiusExp. */
  radiusExp: 0.25,
  /** Body length in wu at spawn mass. */
  baseLength: 180,
  /** Length growth per mass point (wu). */
  lengthPerMass: 4.5,
  /** Path sample spacing (wu) — body follows head path at this resolution. */
  pathSpacing: 10,
  /** Max path samples kept per worm (bounds memory; supports very long worms). */
  maxPathSamples: 2048,
  /** Spacing between rendered body segments in wu (render-side only). */
  segmentSpacing: 16,
} as const;

export const BOOST = {
  /** Mass drained per second of boosting. */
  massDrainPerSec: 3,
  /** Mass shed is dropped behind as small food every this many seconds. */
  dropInterval: 0.35,
  /** Value of each boost-dropped food pellet. */
  dropFoodValue: 1,
  /** Below this mass boosting is unavailable. */
  minMassToBoost: 12,
} as const;

export type FoodKind = "COMMON" | "RARE" | "EPIC" | "BONUS" | "DEATH_LOOT";

export const FOOD: Record<FoodKind, {
  value: number; radius: number; spawnWeight: number;
}> = {
  COMMON: { value: 1, radius: 7, spawnWeight: 78 },
  RARE: { value: 3, radius: 10, spawnWeight: 16 },
  EPIC: { value: 8, radius: 13, spawnWeight: 5 },
  BONUS: { value: 20, radius: 16, spawnWeight: 1 },
  DEATH_LOOT: { value: 4, radius: 11, spawnWeight: 0 }, // never ambient-spawned
};

export const FOOD_RULES = {
  /** Target ambient food count per wu² (density). */
  densityPer1e6: 55, // per 1,000,000 wu² (i.e. ~5500 items in a 10000² world... see note)
  /** Hard cap on total ambient food in a room. */
  maxAmbient: 6000,
  /** Pickup reach = worm head radius + food radius + this slack (wu). */
  pickupSlack: 4,
  /** Magnet powerup pull radius (wu). */
  magnetRadius: 220,
  /** Fraction of a dead worm's mass dropped as DEATH_LOOT. */
  deathDropFraction: 0.6,
  /** Loot pellets scatter within this radius along the corpse path (wu). */
  deathScatter: 30,
} as const;

export type PowerupKind =
  | "SPEED" | "MAGNET" | "DOUBLE_GROWTH" | "SHIELD" | "BOOST_REDUCTION"
  | "SCORE_MULTIPLIER" | "ZOOM";

export const POWERUPS: Record<PowerupKind, {
  durationSec: number; spawnWeight: number; radius: number;
}> = {
  SPEED: { durationSec: 8, spawnWeight: 24, radius: 16 },
  MAGNET: { durationSec: 12, spawnWeight: 24, radius: 16 },
  DOUBLE_GROWTH: { durationSec: 15, spawnWeight: 20, radius: 16 },
  SHIELD: { durationSec: 6, spawnWeight: 12, radius: 16 },
  BOOST_REDUCTION: { durationSec: 15, spawnWeight: 12, radius: 16 },
  SCORE_MULTIPLIER: { durationSec: 15, spawnWeight: 8, radius: 16 },
  ZOOM: { durationSec: 12, spawnWeight: 16, radius: 16 },
};

export const POWERUP_RULES = {
  /** Concurrent powerup pickups present in the world per 25 players. */
  worldCountPer25Players: 6,
  maxWorld: 24,
  speedMultiplier: 1.35,
  boostDrainReduction: 0.5,
  scoreMultiplier: 2,
} as const;

export const SCORE = {
  perFoodValue: 1,       // score per mass point eaten
  perKill: 50,
  survivalPerSec: 0,     // off by default (spec: optional)
} as const;

export const ROOM = {
  /** Target players per room (spec §109: 25–50). */
  maxPlayers: 40,
  /** Dispose an empty room after this many seconds. */
  emptyDisposeSec: 30,
  /** Minimum spawn distance from any other worm's head (wu). */
  spawnClearRadius: 600,
  /** Spawn attempts before falling back to best candidate. */
  spawnAttempts: 12,
  /** Leaderboard entries broadcast. */
  leaderboardSize: 10,
  /** Leaderboard broadcast interval (seconds). */
  leaderboardInterval: 1,
} as const;

export const CAMERA = {
  /** Base zoom at spawn mass. */
  baseZoom: 1,
  /** Zoom shrinks with mass: zoom = baseZoom * (spawnMass/mass)^zoomExp, floored. */
  zoomExp: 0.12,
  minZoom: 0.55,
  /** Camera position smoothing half-life (seconds). */
  smoothHalfLife: 0.09,
  /** Fairness reference viewport (wu visible at massZoom 1) — the camera
   *  normalizes to this no matter the canvas/browser-zoom size, so resizing
   *  or zooming the browser can never reveal more of the world (anti-cheat). */
  viewRefWidth: 1500,
  viewRefHeight: 850,
  /** ZOOM powerup: extra view multiplier while active (fair — server-granted). */
  zoomPowerupFactor: 1.35,
} as const;

/** Anti-cheat envelopes (spec §54) — tolerances above theoretical maxima so
 *  latency/jitter never punish honest players. */
export const VALIDATION = {
  speedTolerance: 1.15,
  turnTolerance: 1.25,
  pickupDistanceTolerance: 1.6,
  maxInputRate: 40,        // hard drop threshold (msgs/sec)
  maxMassGainPerSec: 400,  // sanity ceiling
} as const;
