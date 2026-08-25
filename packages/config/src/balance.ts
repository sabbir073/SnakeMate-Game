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
  /** Client input send rate (Hz) — one intention per sim tick (1:1 with the
   *  fixed timestep keeps prediction replay exact). */
  inputRate: 60,
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
  size: 18000,
  /** Hard ceiling from spec §21 — config may raise size up to this. */
  maxSize: 100000,
  /** Radius of the soft boundary band where worms are turned back / die. */
  boundaryKillsAt: 0, // distance beyond edge that kills (0 = touching edge)
} as const;

export const WORM = {
  /** Base cruise speed (wu/s). Turn rates below are scaled with this so the
   *  coil/turn-radius geometry (and the encircle-squeeze rules) stay intact
   *  when the game's pace changes. */
  baseSpeed: 240,
  /** Boost speed multiplier. */
  boostMultiplier: 1.8,
  /** Max turn rate at minimum mass (rad/s). */
  turnRateMax: 5.9,
  /** Turn rate floor for huge worms (rad/s). Tuned so a big worm's tightest
   *  coil (baseSpeed / floor ≈ 83 wu) squeezes BELOW the space a trapped
   *  small worm needs to keep dodging (≈ 104 wu incl. body clearances) —
   *  encircled prey slowly runs out of room and dies, wormate-style — while
   *  staying heavy enough that the squeeze closes over several smooth laps,
   *  never in a sudden dive. */
  turnRateMin: 2.9,
  /** Mass at which turn rate reaches its floor (gentler ramp = smoother). */
  turnRateMassRef: 1000,
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
  maxPathSamples: 4096,
  /** Spacing between rendered body segments in wu (render-side only). */
  segmentSpacing: 16,
} as const;

export const BOOST = {
  /** Boost sheds this FRACTION of current mass per second — proportional like
   *  wormate, so boost keeps working all the way down to spawn size instead
   *  of eating a small worm's whole reserve in seconds. */
  massDrainFracPerSec: 0.015,
  /** Drain floor (mass/s) so giant worms still pay something noticeable. */
  massDrainMinPerSec: 0.8,
  /** Mass shed is dropped behind as small food every this many seconds. */
  dropInterval: 0.35,
  /** Value of each boost-dropped food pellet. */
  dropFoodValue: 1,
  /** Below this mass boosting is unavailable (a hair above spawn mass, so
   *  players can boost until they are tiny — exactly spawn-sized). */
  minMassToBoost: 10.5,
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
  maxAmbient: 14000,
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
  | "SCORE_MULTIPLIER" | "SCORE_X5" | "SCORE_X10" | "ZOOM";

/** Every powerup lasts 10 seconds after eating (user spec). */
export const POWERUPS: Record<PowerupKind, {
  durationSec: number; spawnWeight: number; radius: number;
}> = {
  SPEED: { durationSec: 10, spawnWeight: 18, radius: 16 },
  MAGNET: { durationSec: 10, spawnWeight: 22, radius: 16 },
  DOUBLE_GROWTH: { durationSec: 10, spawnWeight: 16, radius: 16 },
  SHIELD: { durationSec: 10, spawnWeight: 14, radius: 16 },
  BOOST_REDUCTION: { durationSec: 10, spawnWeight: 10, radius: 16 },
  SCORE_MULTIPLIER: { durationSec: 10, spawnWeight: 14, radius: 16 }, // 2X
  SCORE_X5: { durationSec: 10, spawnWeight: 7, radius: 16 },
  SCORE_X10: { durationSec: 10, spawnWeight: 3, radius: 16 },
  ZOOM: { durationSec: 10, spawnWeight: 16, radius: 16 },
};

export const POWERUP_RULES = {
  /** Concurrent powerup pickups present in the world per 25 players —
   *  dense enough that players regularly SEE powerup foods on the board. */
  worldCountPer25Players: 30,
  maxWorld: 90,
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

/** Resident AI worms (server-side) — public arenas never feel empty. */
export const AI = {
  /** Bot population target per room. */
  maxBots: 50,
  /** Seconds between staggered bot arrivals while filling up (never all at once). */
  spawnStaggerSec: 2.5,
  /** Bots live until something actually kills them (crash into a worm or the
   *  wall) — no artificial lifetime. A dead bot is replaced by a brand-new
   *  random identity after this many seconds, keeping the arena at maxBots. */
  respawnDelaySec: 2.5,
  /** Bots think every N sim ticks (10 Hz at N=6). */
  thinkEveryTicks: 6,
  /** Channels that get bots: the public default plus explicit bot channels. */
  channels: ["main"],
  channelPrefix: "bots-",
} as const;

/** Anti-cheat envelopes (spec §54) — tolerances above theoretical maxima so
 *  latency/jitter never punish honest players. */
export const VALIDATION = {
  speedTolerance: 1.15,
  turnTolerance: 1.25,
  pickupDistanceTolerance: 1.6,
  maxInputRate: 95,        // hard drop threshold (msgs/sec) — must exceed
                           // NET.inputRate with jitter-burst headroom, or the
                           // guard blackouts steering at each window tail
  maxMassGainPerSec: 400,  // sanity ceiling
} as const;
