import { Room } from "@colyseus/core";
import type { AuthContext, Client } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
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
import { AI } from "@nibblio/config";
import { AiBrain, BOT_NAMES, shouldRunBots } from "./ai.js";
import { InputGuard } from "../anti-cheat.js";
import { logger } from "../logger.js";
import { queueMatchResult, touchGuestProfile } from "../db/persistence.js";
import { registerRoom, unregisterRoom } from "../metrics.js";
import { rateLimit } from "../rate-limit.js";
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
  private guards = new Map<string, InputGuard>();
  /** Resident AI worms (bots-as-players): brain + respawn schedule. */
  private botsEnabled = false;
  private bots = new Map<string, { brain: AiBrain; respawnAtTick: number; name: string; skin: string }>();
  private nextBotSerial = 0;
  /** Persistent identity + per-session gameplay accumulators (spec §91). */
  private guestIds = new Map<string, string>();
  private sessionStats = new Map<string, {
    foodCollected: number; powerupsCollected: number; boostTimeSec: number;
  }>();
  /** AOI: currently-visible food ids per client (ADR-008). */
  private visibleFood = new Map<string, Set<number>>();
  private aoiQueryBuf: number[] = [];
  private events: StepEvents = emptyEvents();
  private lastLeaderboardAt = 0;

  /** Tick-duration accounting (spec §50): lifetime + rolling 5s window. */
  private tickDurTotal = 0;
  private tickDurMax = 0;
  private tickCount = 0;
  private windowDur = 0;
  private windowCount = 0;
  private windowMax = 0;
  private rollAvgMs = 0;
  private rollMaxMs = 0;

  override onCreate(options?: JoinOptions): void {
    this.state = new ArenaState();
    this.botsEnabled = shouldRunBots(options?.channel ?? "main");
    this.sim = new Simulation(createRng(hashString(this.roomId)), WORLD.size);
    this.state.worldSize = this.sim.world.worldSize;

    this.setPatchRate(1000 / NET.snapshotRate);
    this.setSimulationInterval(() => this.simTick(), 1000 / SIM.tickRate);

    this.onMessage<InputMessage>(MSG.input, (client, msg) => this.onInput(client, msg));
    this.onMessage(MSG.respawn, (client) => this.spawnWorm(client.sessionId));
    this.onMessage(MSG.ping, (client, msg: { t: number }) => {
      if (typeof msg?.t === "number") client.send(MSG.ping, msg);
    });

    registerRoom(this.roomId, () => ({
      roomId: this.roomId,
      players: this.clients.length,
      worms: this.sim.world.worms.size,
      food: this.sim.world.food.size,
      tickAvgMs: Number(this.rollAvgMs.toFixed(3)),
      tickMaxMs: Number(this.rollMaxMs.toFixed(3)),
      tick: this.sim.world.tick,
    }));

    logger.info({ roomId: this.roomId, event: "room_create" }, "arena room created");
  }

  override async onAuth(_client: Client, _options: unknown, context: AuthContext): Promise<boolean> {
    const headers = (context as { headers?: Record<string, string | string[] | undefined> }).headers;
    const fwd = headers?.["x-forwarded-for"];
    const ip = (context as { ip?: string }).ip
      ?? (Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]?.trim())
      ?? "unknown";
    // spec §56: 20 joins/min per IP — generous for humans, stops join floods
    const allowed = await rateLimit(`join:${ip}`, 20, 60);
    if (!allowed) throw new Error("rate_limited");
    return true;
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
    const guestId = typeof options.guestId === "string" ? options.guestId.slice(0, 64) : "";
    if (guestId) {
      this.guestIds.set(client.sessionId, guestId);
      touchGuestProfile(guestId, nickname, options.skinId ?? "s0");
    }
    client.view = new StateView();
    this.spawnWorm(client.sessionId, nickname, options.skinId ?? "s0");
    this.refreshAoiFor(client); // immediate first snapshot of nearby food

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

    if (worm?.alive) this.persistRun(client.sessionId, false);
    this.removeWorm(client.sessionId);
    this.guestIds.delete(client.sessionId);
    logger.info(
      { roomId: this.roomId, sessionId: client.sessionId, event: "player_leave" },
      "player left",
    );
  }

  override onDispose(): void {
    unregisterRoom(this.roomId);
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

    if (this.botsEnabled) this.runBots();

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

    this.accumulateSessionStats();
    this.syncSchema();
    if (this.sim.world.tick % NET.aoiRefreshTicks === 0) this.refreshAoi();
    this.dispatchEvents();
    this.maybeBroadcastLeaderboard();

    const dur = performance.now() - t0;
    this.tickDurTotal += dur;
    this.tickCount++;
    if (dur > this.tickDurMax) this.tickDurMax = dur;
    this.windowDur += dur;
    this.windowCount++;
    if (dur > this.windowMax) this.windowMax = dur;
    if (this.windowCount >= SIM.tickRate * 5) {
      this.rollAvgMs = this.windowDur / this.windowCount;
      this.rollMaxMs = this.windowMax;
      this.windowDur = 0;
      this.windowCount = 0;
      this.windowMax = 0;
    }
  }

  private onInput(client: Client, msg: InputMessage): void {
    let guard = this.guards.get(client.sessionId);
    if (!guard) {
      guard = new InputGuard();
      this.guards.set(client.sessionId, guard);
    }
    if (!guard.check(msg, Date.now()).ok) return; // spec §54: drop, never trust
    this.pendingInputs.set(client.sessionId, {
      seq: msg.seq >>> 0,
      angle: wrapAngle(msg.angle),
      boost: msg.boost,
    });
  }

  // ── resident AI worms (bots play as real users) ──────────────────────────

  private runBots(): void {
    const tick = this.sim.world.tick;

    // population management (1 Hz): fill to the floor, yield seats to humans
    if (tick % 60 === 0) {
      const humans = this.clients.length;
      const desired = Math.max(0, Math.min(AI.maxBots, AI.minPopulation - humans));

      while (this.bots.size < desired) this.addBot();

      if (this.bots.size > desired) {
        // retire the lowest-score living bot naturally (dies, drops loot)
        let excess = this.bots.size - desired;
        const living = [...this.bots.keys()]
          .map((id) => this.sim.world.worms.get(id))
          .filter((w) => w?.alive)
          .sort((a, b) => (a!.score - b!.score));
        for (const w of living) {
          if (excess <= 0) break;
          this.pendingForceKills.push(w!.id);
          this.bots.delete(w!.id);
          excess--;
        }
      }
    }

    // thinking + respawns
    for (const [botId, bot] of this.bots) {
      const worm = this.sim.world.worms.get(botId);
      if (!worm || !worm.alive) {
        if (bot.respawnAtTick === 0) {
          bot.respawnAtTick = tick + Math.round(AI.respawnDelaySec * SIM.tickRate);
        } else if (tick >= bot.respawnAtTick) {
          bot.respawnAtTick = 0;
          this.spawnWorm(botId, bot.name, bot.skin);
        }
        continue;
      }
      if (tick % AI.thinkEveryTicks === 0) {
        const input = bot.brain.think(this.sim);
        if (input) this.pendingInputs.set(botId, input);
      }
    }
  }

  private addBot(): void {
    const serial = this.nextBotSerial++;
    const botId = `bot:${this.roomId}:${serial}`;
    const name = BOT_NAMES[serial % BOT_NAMES.length] ?? "Wormy";
    const skin = `s${serial % 6}`;
    this.bots.set(botId, {
      brain: new AiBrain(botId, hashString(botId)),
      respawnAtTick: 0,
      name,
      skin,
    });
    this.spawnWorm(botId, name, skin);
    logger.info({ roomId: this.roomId, botId, name, event: "bot_spawn" }, "bot joined arena");
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
    this.visibleFood.delete(sessionId);
    const guard = this.guards.get(sessionId);
    if (guard && guard.rejected > 0) {
      logger.warn(
        { roomId: this.roomId, sessionId, rejectedInputs: guard.rejected, event: "input_rejections" },
        "player had rejected inputs",
      );
    }
    this.guards.delete(sessionId);
  }

  // ── per-session stat accumulation (spec §91) ─────────────────────────────

  private statsFor(sessionId: string) {
    let st = this.sessionStats.get(sessionId);
    if (!st) {
      st = { foodCollected: 0, powerupsCollected: 0, boostTimeSec: 0 };
      this.sessionStats.set(sessionId, st);
    }
    return st;
  }

  private accumulateSessionStats(): void {
    for (const e of this.events.foodEaten) this.statsFor(e.wormId).foodCollected++;
    for (const e of this.events.powerupsTaken) this.statsFor(e.wormId).powerupsCollected++;
    for (const w of this.sim.world.worms.values()) {
      if (w.alive && w.boosting) this.statsFor(w.id).boostTimeSec += SIM.dt;
    }
  }

  /** Queue this session's run into the async persistence batch. */
  private persistRun(sessionId: string, died: boolean): void {
    const guestId = this.guestIds.get(sessionId);
    const worm = this.sim.world.worms.get(sessionId);
    if (!guestId || !worm) return;
    const st = this.statsFor(sessionId);
    queueMatchResult({
      guestId,
      score: worm.score,
      kills: worm.kills,
      survivedSec: (this.sim.world.tick - worm.spawnTick) / SIM.tickRate,
      rank: this.rankOf(sessionId),
      foodCollected: st.foodCollected,
      powerupsCollected: st.powerupsCollected,
      boostTimeSec: st.boostTimeSec,
      died,
    });
    this.sessionStats.delete(sessionId);
  }

  // ── interest management (spec §30, ADR-008) ──────────────────────────────

  private refreshAoi(): void {
    for (const client of this.clients) this.refreshAoiFor(client);
  }

  /** Diff the client's visible-food set against a spatial query around its
   *  worm; add/remove StateView membership accordingly. Worms and powerups
   *  sync globally (≤40/≤24 entries — bandwidth-trivial, leaderboard-friendly). */
  private refreshAoiFor(client: Client): void {
    const view = client.view;
    const worm = this.sim.world.worms.get(client.sessionId);
    if (!view || !worm) return;
    let seen = this.visibleFood.get(client.sessionId);
    if (!seen) {
      seen = new Set();
      this.visibleFood.set(client.sessionId, seen);
    }

    this.sim.queryFood(worm.x, worm.y, NET.aoiFoodRadius, this.aoiQueryBuf);
    const next = new Set(this.aoiQueryBuf);

    for (const id of next) {
      if (seen.has(id)) continue;
      const fs = this.state.food.get(String(id));
      if (fs) {
        view.add(fs);
        seen.add(id);
      }
    }
    for (const id of seen) {
      if (next.has(id)) continue;
      const fs = this.state.food.get(String(id));
      if (fs) view.remove(fs);
      seen.delete(id);
    }
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
      this.persistRun(death.wormId, true);
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
