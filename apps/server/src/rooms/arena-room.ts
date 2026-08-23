import { Room } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import { NET, ROOM, SIM, WORLD } from "@nibblio/config";
import { Simulation, activeEffects, createWorm, emptyEvents } from "@nibblio/game-core";
import type { StepEvents, WormInput } from "@nibblio/game-core";
import {
  ARENA_ROOM, MSG, PROTOCOL_VERSION, sanitizeNickname,
} from "@nibblio/protocol";
import type {
  InputMessage, JoinOptions, LeaderboardMessage, RejectMessage, WelcomeMessage,
} from "@nibblio/protocol";
import { createRng, hashString, wrapAngle } from "@nibblio/shared";
import { logger } from "../logger.js";
import { SERVER_VERSION } from "../version.js";
import { ArenaState, FoodSchema, PowerupSchema, WormSchema } from "./state.js";

export { ARENA_ROOM };

/** Authoritative arena room (spec §24–25).
 *  M0/M1 scope: fixed 60 Hz simulation via game-core, schema sync at
 *  snapshotRate, input intentions only. AOI filtering lands in M3. */
export class ArenaRoom extends Room<ArenaState> {
  override maxClients = ROOM.maxPlayers;

  private sim!: Simulation;
  private pendingInputs = new Map<string, WormInput>();
  private pendingForceKills: string[] = [];
  private events: StepEvents = emptyEvents();
  private lastLeaderboardAt = 0;

  /** Tick-duration accounting (spec §50). */
  private tickDurTotal = 0;
  private tickDurMax = 0;
  private tickCount = 0;

  override onCreate(): void {
    this.state = new ArenaState();
    this.sim = new Simulation(createRng(hashString(this.roomId)), WORLD.size);
    this.state.worldSize = this.sim.world.worldSize;

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
      worldSize: this.sim.world.worldSize,
      tickRate: SIM.tickRate,
      snapshotRate: NET.snapshotRate,
    };
    client.send(MSG.welcome, welcome);
    logger.info(
      { roomId: this.roomId, sessionId: client.sessionId, nickname, event: "player_join" },
      "player joined",
    );
  }

  override async onLeave(client: Client, consented?: boolean): Promise<void> {
    const worm = this.sim.world.worms.get(client.sessionId);

    // Reconnect grace (spec §74): an unexpected drop keeps the worm alive
    // (server-piloted: no inputs ⇒ it cruises straight, no boost) while the
    // client may resume the same session.
    if (!consented && worm?.alive) {
      logger.info(
        { roomId: this.roomId, sessionId: client.sessionId, event: "player_drop" },
        "player dropped — holding worm for reconnect",
      );
      try {
        await this.allowReconnection(client, NET.reconnectGraceSec);
        logger.info(
          { roomId: this.roomId, sessionId: client.sessionId, event: "player_reconnect" },
          "player reconnected",
        );
        return; // worm was never removed; play continues
      } catch {
        // grace expired — the worm dies normally (loot drops) on the next tick
        this.pendingForceKills.push(client.sessionId);
        logger.info(
          { roomId: this.roomId, sessionId: client.sessionId, event: "reconnect_expired" },
          "reconnect window expired",
        );
        return;
      }
    }

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
    this.sim.step(this.pendingInputs, this.events);
    this.pendingInputs.clear();

    // expired-reconnect worms die between ticks; loot syncs with this tick
    if (this.pendingForceKills.length > 0) {
      for (const id of this.pendingForceKills) this.sim.forceKill(id, this.events);
      const killed = this.pendingForceKills.splice(0);
      // remove abandoned worms shortly after their death is broadcast
      this.clock.setTimeout(() => {
        for (const id of killed) this.removeWorm(id);
      }, 1500);
    }

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
    const existing = this.sim.world.worms.get(sessionId);
    if (existing?.alive) return;
    const name = nickname ?? existing?.nickname ?? "Worm";
    const skin = skinId ?? existing?.skinId ?? "s0";
    this.removeWorm(sessionId);

    const spot = this.sim.findSpawnSpot();
    const worm = createWorm({
      id: sessionId,
      ownerId: sessionId,
      nickname: name,
      skinId: skin,
      x: spot.x,
      y: spot.y,
      angle: this.sim.randomAngle(),
      spawnTick: this.sim.world.tick,
    });
    this.sim.addWorm(worm);

    const ws = new WormSchema();
    ws.id = sessionId;
    ws.nickname = name;
    ws.skinId = skin;
    this.state.worms.set(sessionId, ws);
  }

  private removeWorm(sessionId: string): void {
    this.sim.removeWorm(sessionId);
    this.state.worms.delete(sessionId);
  }

  // ── sync & events ─────────────────────────────────────────────────────────

  private syncSchema(): void {
    this.state.tick = this.sim.world.tick;

    // food deltas (events → schema)
    for (const f of this.events.foodSpawned) {
      const fs = new FoodSchema();
      fs.id = f.id;
      fs.kind = f.kind;
      fs.x = f.x;
      fs.y = f.y;
      fs.value = f.value;
      this.state.food.set(String(f.id), fs);
    }
    for (const id of this.events.foodRemoved) {
      this.state.food.delete(String(id));
    }

    // powerup deltas
    for (const p of this.events.powerupsSpawned) {
      const ps = new PowerupSchema();
      ps.id = p.id;
      ps.kind = p.kind;
      ps.x = p.x;
      ps.y = p.y;
      this.state.powerups.set(String(p.id), ps);
    }
    for (const id of this.events.powerupsRemoved) {
      this.state.powerups.delete(String(id));
    }

    for (const [id, w] of this.sim.world.worms) {
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
      const fx = activeEffects(this.sim.world, w).join(",");
      if (ws.effects !== fx) ws.effects = fx;
    }
  }

  private dispatchEvents(): void {
    for (const death of this.events.deaths) {
      const w = this.sim.world.worms.get(death.wormId);
      if (!w) continue;
      const killer = death.killerId ? this.sim.world.worms.get(death.killerId) : null;
      const client = this.clients.find((c) => c.sessionId === death.wormId);
      client?.send(MSG.death, {
        killedBy: killer?.nickname ?? null,
        score: w.score,
        mass: w.mass,
        survivedSec: (this.sim.world.tick - w.spawnTick) / SIM.tickRate,
        rank: this.rankOf(death.wormId),
      });
      logger.info(
        { roomId: this.roomId, wormId: death.wormId, killerId: death.killerId, event: "death" },
        "worm died",
      );
    }
  }

  private rankOf(wormId: string): number {
    const sorted = [...this.sim.world.worms.values()].sort((a, b) => b.score - a.score);
    return sorted.findIndex((w) => w.id === wormId) + 1;
  }

  private maybeBroadcastLeaderboard(): void {
    const now = this.sim.world.tick / SIM.tickRate;
    if (now - this.lastLeaderboardAt < ROOM.leaderboardInterval) return;
    this.lastLeaderboardAt = now;

    const sorted = [...this.sim.world.worms.values()]
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
