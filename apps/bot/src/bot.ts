import { Client, getStateCallbacks } from "colyseus.js";
import type { Room } from "colyseus.js";
import { NET, WORM } from "@nibblio/config";
import { ARENA_ROOM, MSG, PROTOCOL_VERSION } from "@nibblio/protocol";
import type { InputMessage } from "@nibblio/protocol";
import { createRng, wrapAngle } from "@nibblio/shared";
import type { Rng } from "@nibblio/shared";

/** One AI worm (spec §51): wander, seek food, avoid walls, flee bigger worms,
 *  chase smaller ones, boost opportunistically, respawn on death. */

interface Vec { x: number; y: number }

interface BotView {
  me: { x: number; y: number; mass: number; alive: boolean } | null;
  food: Map<string, Vec>;
  worms: Map<string, { x: number; y: number; mass: number; alive: boolean }>;
  worldSize: number;
}

export interface BotStats {
  joined: number;
  errors: number;
  disconnects: number;
  inputsSent: number;
  deaths: number;
  respawns: number;
}

export class Bot {
  private rng: Rng;
  private room: Room | null = null;
  private view: BotView = { me: null, food: new Map(), worms: new Map(), worldSize: 10000 };
  private seq = 0;
  private angle = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private sessionId = "";

  constructor(
    private readonly id: number,
    private readonly url: string,
    private readonly channel: string,
    private readonly stats: BotStats,
  ) {
    this.rng = createRng(7700 + id);
    this.angle = this.rng.range(-Math.PI, Math.PI);
  }

  async start(): Promise<void> {
    const client = new Client(this.url);
    try {
      this.room = await client.joinOrCreate(ARENA_ROOM, {
        protocolVersion: PROTOCOL_VERSION,
        nickname: `Bot${this.id}`,
        skinId: `s${this.id % 6}`,
        channel: this.channel,
        guestId: `bot-${this.channel}-${this.id}`,
      });
      this.stats.joined++;
    } catch (err) {
      this.stats.errors++;
      console.error(`[bot ${this.id}] join failed:`, (err as Error).message);
      return;
    }

    const room = this.room;
    this.sessionId = room.sessionId;
    room.onLeave(() => {
      this.stats.disconnects++;
      this.stopLoop();
    });
    room.onMessage(MSG.death, () => {
      this.stats.deaths++;
      // brief pause then respawn — like a human clicking PLAY AGAIN
      setTimeout(() => {
        try {
          room.send(MSG.respawn);
          this.stats.respawns++;
        } catch { this.stats.errors++; }
      }, 300 + this.rng.int(0, 900));
    });
    room.onMessage("*", () => { /* consume */ });

    const $ = getStateCallbacks(room);
    const st = room.state as { worldSize?: number };
    if (st.worldSize) this.view.worldSize = st.worldSize;

    const wormsCb = $(room.state).worms;
    const foodCb = $(room.state).food;
    if (!wormsCb || !foodCb) throw new Error("state collections missing");

    wormsCb.onAdd((w, key: string) => {
      const entry = { x: w.x, y: w.y, mass: w.mass, alive: w.alive };
      this.view.worms.set(key, entry);
      if (key === this.sessionId) this.view.me = entry;
      $(w).onChange(() => {
        entry.x = w.x; entry.y = w.y; entry.mass = w.mass; entry.alive = w.alive;
      });
    });
    wormsCb.onRemove((_w, key: string) => {
      this.view.worms.delete(key);
      if (key === this.sessionId) this.view.me = null;
    });
    foodCb.onAdd((f, key: string) => {
      this.view.food.set(key, { x: f.x, y: f.y });
    });
    foodCb.onRemove((_f, key: string) => {
      this.view.food.delete(key);
    });

    this.interval = setInterval(() => this.think(), 1000 / NET.inputRate);
  }

  private think(): void {
    const room = this.room;
    const me = this.view.me;
    if (!room || !me || !me.alive) return;

    let boost = false;
    let target: Vec | null = null;

    // 1. wall avoidance dominates everything
    const margin = 700;
    const size = this.view.worldSize;
    if (me.x < margin || me.y < margin || me.x > size - margin || me.y > size - margin) {
      target = { x: size / 2, y: size / 2 };
    } else {
      // 2. threats/prey among nearby worms
      let threat: Vec | null = null;
      let prey: Vec | null = null;
      let threatD = 900;
      let preyD = 1100;
      for (const [key, w] of this.view.worms) {
        if (key === this.sessionId || !w.alive) continue;
        const d = Math.hypot(w.x - me.x, w.y - me.y);
        if (w.mass > me.mass * 1.3 && d < threatD) { threat = w; threatD = d; }
        else if (me.mass > w.mass * 1.5 && d < preyD) { prey = w; preyD = d; }
      }
      if (threat) {
        // flee directly away, boost if it's close
        target = { x: me.x + (me.x - threat.x), y: me.y + (me.y - threat.y) };
        boost = threatD < 450 && me.mass > WORM.minMass + 8;
      } else if (prey && this.rng.next() < 0.7) {
        target = prey;
        boost = preyD > 300 && me.mass > WORM.minMass + 15 && this.rng.next() < 0.4;
      } else {
        // 3. nearest food
        let best: Vec | null = null;
        let bestD = Infinity;
        for (const f of this.view.food.values()) {
          const d = Math.hypot(f.x - me.x, f.y - me.y);
          if (d < bestD) { bestD = d; best = f; }
        }
        target = best;
      }
    }

    if (target) {
      this.angle = Math.atan2(target.y - me.y, target.x - me.x);
    } else if (this.rng.next() < 0.04) {
      this.angle = this.rng.range(-Math.PI, Math.PI);
    }

    const input: InputMessage = { seq: ++this.seq, angle: wrapAngle(this.angle), boost };
    try {
      room.send(MSG.input, input);
      this.stats.inputsSent++;
    } catch {
      this.stats.errors++;
    }
  }

  private stopLoop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async stop(): Promise<void> {
    this.stopLoop();
    try {
      await this.room?.leave(true);
    } catch { /* already gone */ }
    this.room = null;
  }
}
