# GAMEPLAY

## Core loop (spec §11)

JOIN → SPAWN → MOVE → EAT → GROW → BOOST → HUNT/ESCAPE → COLLIDE → DIE →
LOOT → RANK → PLAY AGAIN. Implemented end-to-end in M1; every tuning value
lives in `packages/config/src/balance.ts`.

## Movement & steering (spec §16)

Worms move continuously at `WORM.baseSpeed` (180 wu/s); the pointer/joystick
sets a target heading and the sim turns toward it at a mass-scaled turn rate
(`turnRateMax` 4.4 rad/s at spawn → `turnRateMin` 1.6 rad/s at ≥500 mass).
Big worms steer like trucks — that asymmetry is the core skill dynamic:
small worms dodge, big worms cut off.

## Boost (spec §17)

Hold (pointer/space/boost button) → ×1.8 speed. Costs `massDrainPerSec` (3/s),
sheds pellets behind the tail every 0.35 s (recyclable by anyone), disabled at
≤12 mass so a worm can never boost itself out of existence.

## Food (spec §18)

| Kind | value | radius | ambient weight |
|---|---|---|---|
| COMMON | 1 | 7 | 78 |
| RARE | 3 | 10 | 16 |
| EPIC | 8 | 13 | 5 |
| BONUS | 20 | 16 | 1 |
| DEATH_LOOT | 4 | 11 | never ambient |

Ambient density: 55 per 10⁶ wu² (≈5500 in the default 10000² world), capped
6000, replenished ≤20/tick. Pickup = head radius + food radius + 4 slack.

## Death & loot (spec §112)

Touching the arena edge or another worm's body/head kills. Head-on: both die.
Self-collision never kills. A corpse drops 60 % of its mass as DEATH_LOOT
pellets scattered along the body path — creating the conflict hotspots that
drive the mid-game.

## Score (spec §114)

score = Σ food value × 1 (+ ×2 under SCORE_MULTIPLIER) + 50/kill.
Leaderboard: top 10 broadcast 1/s + own rank always shown.

## Worm body (spec §14–15)

Path-based: the head integrates motion; the body is sampled from the head's
path history at 10 wu spacing. Length = 180 + 4.5·(mass−10) wu;
radius = 14·(mass/10)^0.25. Only head state crosses the network; clients
reconstruct bodies locally.

## Powerups (spec §19) — M2

SPEED ×1.35, MAGNET (220 wu pull), DOUBLE_GROWTH, SHIELD, BOOST_REDUCTION
(half drain), SCORE_MULTIPLIER ×2. Effect plumbing exists in game-core
(`worm.effects` expiry ticks); world spawning + visuals land in M2.
