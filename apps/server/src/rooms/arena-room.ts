import { Room } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import { NET, ROOM, SIM, WORLD, WORM } from "@nibblio/config";
import {
  createWorld, createWorm, emptyEvents, stepWorld,
} from "@nibblio/game-core";
import type { StepEvents, WorldState, WormInput } from "@nibblio/game-core";
import {
  ARENA_ROOM, MSG, PROTOCOL_VERSION, sanitizeNickname,
} from "@nibblio/protocol";
import type {
  InputMessage, JoinOptions, LeaderboardMessage, RejectMessage, WelcomeMessage,
} from "@nibblio/protocol";
import { createRng, hashString, wrapAngle } from "@nibblio/shared";
import { logger } from "../logger.js";
import { SERVER_VERSION } from "../version.js";
import { ArenaState, WormSchema } from "./state.js";

export { ARENA_ROOM };

/** Authoritative arena room (spec §24–25).
 *  M0/M1 scope: fixed 60 Hz simulation via game-core, schema sync at
 *  snapshotRate, input intentions only. AOI filtering lands in M3. */
export class ArenaRoom extends Room<ArenaState> {
  override maxClients = ROOM.maxPlayers;

  private world: WorldState = createWorld(WORLD.size);
  private rng = createRng(0);
  private pendingInputs = new Map<string, WormInput>();
  private events: StepEvents = emptyEvents();
  private lastLeaderboardAt = 0;

  /** Tick-duration accounting (spec §50). */
  private tickDurTotal = 0;
  private tickDurMax = 0;
  private tickCount = 0;

  override onCreate(): void {
    this.state = new ArenaState();
    this.state.worldSize = this.world.worldSize;
    this.rng = createRng(hashString(this.roomId));

    this.setPatchRate(1000 / NET.snapshotRate);
    this.setSimulationInterval(() => this.simTick(), 1000 / SIM.tickRate);

    this.onMessage<InputMessage>(MSG.input, (client, msg) => this.onInput(client, msg));
    this.onMessage(MSG.respawn, (client) => this.spawnWorm(client.sessionId));

    logger.info({ roomId: this.roomId, event: "room_create" }, "arena room created");
  }

  override onJoin(client: Client, options: JoinOptions): void {
    if (options?.protocolVersion !== PROTOCOL_VERSION) {
      const reject: RejectMessage = {
        reason: "protocol_mismatch",
        requiredProtocol: PROTOCOL_VERSION,
      };
      client.send(MSG.reject, reject);
      client.leave(4000);
      return;
    }

    const nickname = sanitizeNickname(options.nickname ?? "");
    this.spawnWorm(client.sessionId, nickname, options.skinId ?? "s0");

    const welcome: WelcomeMessage = {
      playerId: client.sessionId,
      protocolVersion: PROTOCOL_VERSION,
      serverVersion: SERVER_VERSION,
      worldSize: this.world.worldSize,
      tickRate: SIM.tickRate,
      snapshotRate: NET.snapshotRate,
    };
    client.send(MSG.welcome, welcome);
    logger.info(
      { roomId: this.roomId, sessionId: client.sessionId, nickname, event: "player_join" },
      "player joined",
    );
  }

  override onLeave(client: Client): void {
    // M1 scope: leaving removes the worm. Reconnect grace lands in M2 (§74).
    this.removeWorm(client.sessionId);
    logger.info(
      { roomId: this.roomId, sessionId: client.sessionId, event: "player_leave" },
      "player left",
    );
  }

  override onDispose(): void {
    const avg = this.tickCount ? (this.tickDurTotal / this.tickCount).toFixed(3) : "0";
    logger.info(
      {
        roomId: this.roomId, event: "room_dispose",
        tickAvgMs: Number(avg), tickMaxMs: Number(this.tickDurMax.toFixed(3)),
      },
      "arena room disposed",
    );
  }

  // ── simulation ────────────────────────────────────────────────────────────

  private simTick(): void {
    const t0 = performance.now();

    this.events = emptyEvents();
    stepWorld(this.world, this.pendingInputs, this.events, this.rng);
    this.pendingInputs.clear();

    this.syncSchema();
    this.dispatchEvents();
    this.maybeBroadcastLeaderboard();

    const dur = performance.now() - t0;
    this.tickDurTotal += dur;
    this.tickCount++;
    if (dur > this.tickDurMax) this.tickDurMax = dur;
  }

  private onInput(client: Client, msg: InputMessage): void {
    // Shape validation — full anti-cheat envelopes land in M3 (§54).
    if (
      typeof msg?.seq !== "number" || typeof msg.angle !== "number" ||
      !Number.isFinite(msg.angle) || typeof msg.boost !== "boolean"
    ) {
      return;
    }
    this.pendingInputs.set(client.sessionId, {
      seq: msg.seq >>> 0,
      angle: wrapAngle(msg.angle),
      boost: msg.boost,
    });
  }

  // ── worm lifecycle ────────────────────────────────────────────────────────

  private spawnWorm(sessionId: string, nickname?: string, skinId?: string): void {
    const existing = this.world.worms.get(sessionId);
    if (existing?.alive) return;
    const name = nickname ?? existing?.nickname ?? "Worm";
    const skin = skinId ?? existing?.skinId ?? "s0";
    this.removeWorm(sessionId);

    const spot = this.findSpawnSpot();
    const worm = createWorm({
      id: sessionId,
      ownerId: sessionId,
      nickname: name,
      skinId: skin,
      x: spot.x,
      y: spot.y,
      angle: this.rng.range(-Math.PI, Math.PI),
      spawnTick: this.world.tick,
    });
    this.world.worms.set(sessionId, worm);

    const ws = new WormSchema();
    ws.id = sessionId;
    ws.nickname = name;
    ws.skinId = skin;
    this.state.worms.set(sessionId, ws);
  }

  private removeWorm(sessionId: string): void {
    this.world.worms.delete(sessionId);
    this.state.worms.delete(sessionId);
  }

  /** Spawn away from other worms (spec §111). */
  private findSpawnSpot(): { x: number; y: number } {
    const margin = WORM.baseLength + 200;
    let best = { x: this.world.worldSize / 2, y: this.world.worldSize / 2 };
    let bestClearance = -1;
    for (let i = 0; i < ROOM.spawnAttempts; i++) {
      const x = this.rng.range(margin, this.world.worldSize - margin);
      const y = this.rng.range(margin, this.world.worldSize - margin);
      let clearance = Infinity;
      for (const w of this.world.worms.values()) {
        if (!w.alive) continue;
        const d = Math.hypot(w.x - x, w.y - y);
        if (d < clearance) clearance = d;
      }
      if (clearance >= ROOM.spawnClearRadius) return { x, y };
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = { x, y };
      }
    }
    return best;
  }

  // ── sync & events ─────────────────────────────────────────────────────────

  private syncSchema(): void {
    this.state.tick = this.world.tick;
    for (const [id, w] of this.world.worms) {
      const ws = this.state.worms.get(id);
      if (!ws) continue;
      ws.x = w.x;
      ws.y = w.y;
      ws.angle = w.angle;
      ws.speed = w.speed;
      ws.mass = w.mass;
      ws.boosting = w.boosting;
      ws.alive = w.alive;
      ws.lastInputSeq = w.lastInputSeq;
    }
  }

  private dispatchEvents(): void {
    for (const death of this.events.deaths) {
      const w = this.world.worms.get(death.wormId);
      if (!w) continue;
      const killer = death.killerId ? this.world.worms.get(death.killerId) : null;
      const client = this.clients.find((c) => c.sessionId === death.wormId);
      client?.send(MSG.death, {
        killedBy: killer?.nickname ?? null,
        score: w.score,
        mass: w.mass,
        survivedSec: (this.world.tick - w.spawnTick) / SIM.tickRate,
        rank: this.rankOf(death.wormId),
      });
      logger.info(
        { roomId: this.roomId, wormId: death.wormId, killerId: death.killerId, event: "death" },
        "worm died",
      );
    }
  }

  private rankOf(wormId: string): number {
    const sorted = [...this.world.worms.values()].sort((a, b) => b.score - a.score);
    return sorted.findIndex((w) => w.id === wormId) + 1;
  }

  private maybeBroadcastLeaderboard(): void {
    const now = this.world.tick / SIM.tickRate;
    if (now - this.lastLeaderboardAt < ROOM.leaderboardInterval) return;
    this.lastLeaderboardAt = now;

    const sorted = [...this.world.worms.values()]
      .filter((w) => w.alive)
      .sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, ROOM.leaderboardSize).map((w) => ({
      id: w.id, name: w.nickname, score: w.score, skinId: w.skinId,
    }));
    for (const client of this.clients) {
      const msg: LeaderboardMessage = {
        top,
        ownRank: sorted.findIndex((w) => w.id === client.sessionId) + 1,
        totalPlayers: sorted.length,
      };
      client.send(MSG.leaderboard, msg);
    }
  }

  /** Perf metrics accessor for /health & monitors (spec §50). */
  metrics(): { players: number; tickAvgMs: number; tickMaxMs: number } {
    return {
      players: this.clients.length,
      tickAvgMs: this.tickCount ? this.tickDurTotal / this.tickCount : 0,
      tickMaxMs: this.tickDurMax,
    };
  }
}
