import type { FoodKind, PowerupKind } from "@nibblio/config";

/** One sampled point of a worm's historical head path (spec §15). */
export interface PathSample {
  x: number;
  y: number;
}

/** Authoritative worm state (spec §14). Pure data — no methods, no references
 *  to engine objects, safe to snapshot/serialize. */
export interface WormState {
  id: string;
  ownerId: string;
  nickname: string;
  skinId: string;

  x: number;
  y: number;
  angle: number;
  /** Current speed in wu/s (already includes boost/powerup multipliers). */
  speed: number;
  targetAngle: number;
  boosting: boolean;

  radius: number;
  mass: number;
  score: number;
  kills: number;

  alive: boolean;
  /** Sim tick at which the worm spawned. */
  spawnTick: number;
  /** Distance accumulated since last path sample (wu). */
  pathAccum: number;
  /** Head path history, newest first is maintained by WormPath wrapper. */
  path: PathSample[];
  /** Total body length in wu (derived from mass, cached per tick). */
  length: number;

  /** Accumulated boost drop timer (seconds). */
  boostDropAccum: number;

  /** Active powerup effects: kind → expiry tick (exclusive). */
  effects: Partial<Record<PowerupKind, number>>;

  /** Last input sequence number applied (for reconciliation acks). */
  lastInputSeq: number;
}

export interface FoodState {
  id: number;
  kind: FoodKind;
  x: number;
  y: number;
  value: number;
  radius: number;
}

export interface PowerupState {
  id: number;
  kind: PowerupKind;
  x: number;
  y: number;
  radius: number;
}

/** Input intention for one worm for one tick. */
export interface WormInput {
  seq: number;
  angle: number;
  boost: boolean;
}

/** Events emitted by a single simulation step — the server turns these into
 *  network messages/analytics; tests assert on them. */
export interface StepEvents {
  deaths: Array<{ wormId: string; killerId: string | null }>;
  foodEaten: Array<{ wormId: string; foodId: number; value: number }>;
  powerupsTaken: Array<{ wormId: string; powerupId: number; kind: PowerupKind }>;
  foodSpawned: FoodState[];
  foodRemoved: number[];
  powerupsSpawned: PowerupState[];
  powerupsRemoved: number[];
}

export interface WorldState {
  tick: number;
  worldSize: number;
  worms: Map<string, WormState>;
  food: Map<number, FoodState>;
  powerups: Map<number, PowerupState>;
  nextEntityId: number;
}
