import Phaser from "phaser";
import { getStateCallbacks } from "colyseus.js";
import { CAMERA, FOOD, GAME, WORM } from "@nibblio/config";
import type { FoodKind } from "@nibblio/config";
import { wrapAngle } from "@nibblio/shared";
import type { WormInput } from "@nibblio/game-core";
import { connect } from "./net.js";
import type { Connection } from "./net.js";
import { LocalPredictor } from "./prediction.js";
import { SnapshotBuffer } from "./interpolation.js";
import { WormRenderer } from "./worm-renderer.js";
import { Hud } from "./hud.js";

export interface StartOptions {
  nickname: string;
  onStatus: (status: string) => void;
}

interface RemoteEntry {
  nickname: string;
  buffer: SnapshotBuffer;
  renderer: WormRenderer;
}

interface FoodEntry {
  kind: FoodKind;
  x: number;
  y: number;
  value: number;
  /** pickup animation progress; <0 = idle */
  scale: number;
}

/** Network-condition simulation (spec §53): `?fakeLag=150` adds 75ms each way
 *  to inputs and state updates — for testing prediction/interpolation. Dev tool
 *  only; the server never trusts anything about it. */
const FAKE_LAG_MS = (() => {
  try {
    return Math.max(0, Number(new URLSearchParams(location.search).get("fakeLag") ?? 0));
  } catch {
    return 0;
  }
})();

function maybeDelay(fn: () => void): void {
  if (FAKE_LAG_MS > 0) setTimeout(fn, FAKE_LAG_MS / 2);
  else fn();
}

const FOOD_COLORS: Record<FoodKind, number> = {
  COMMON: 0x64d2ff,
  RARE: 0x7bffb0,
  EPIC: 0xff8af5,
  BONUS: 0xffe066,
  DEATH_LOOT: 0xffa94d,
};

class ArenaScene extends Phaser.Scene {
  private predictor!: LocalPredictor;
  private localRenderer!: WormRenderer;
  private remotes = new Map<string, RemoteEntry>();
  private food = new Map<number, FoodEntry>();
  private foodGfx!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private inputSeq = 0;
  private boostHeld = false;
  private localAlive = true;
  private localMassView = WORM.spawnMass;
  private localScore = 0;

  constructor(private readonly conn: Connection) {
    super("arena");
  }

  create(): void {
    const worldSize = this.conn.welcome.worldSize;
    this.cameras.main.setBackgroundColor(GAME.backgroundColor);

    // decor placeholders until the art pass (M2)
    this.add
      .grid(worldSize / 2, worldSize / 2, worldSize, worldSize, 160, 160, 0x160b33, 1, 0x241348, 0.6)
      .setDepth(0);
    const border = this.add.graphics().setDepth(1);
    border.lineStyle(14, 0xe84393, 0.9);
    border.strokeRect(0, 0, worldSize, worldSize);

    this.foodGfx = this.add.graphics().setDepth(3);

    // local predictor boots at world center; first reconcile snaps to truth
    this.predictor = new LocalPredictor(worldSize / 2, worldSize / 2, 0);
    this.localRenderer = new WormRenderer(this, "", true);

    this.hud = new Hud(() => {
      this.conn.requestRespawn();
    });
    this.hud.show();

    this.wireState();
    this.wireMessages();
    this.wireInput();

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.hide();
      void this.conn.leave();
    });
  }

  // ── colyseus wiring ───────────────────────────────────────────────────────

  private wireState(): void {
    const $ = getStateCallbacks(this.conn.room);
    const state = this.conn.room.state;
    const worms = $(state).worms;
    const food = $(state).food;
    if (!worms || !food) throw new Error("room state missing collections");
    const ownId = this.conn.room.sessionId;

    worms.onAdd((w, key: string) => {
      if (key === ownId) {
        // authoritative updates for the local worm feed the predictor
        this.localRenderer.setNickname(w.nickname);
        $(w).onChange(() => {
          // capture immediately; apply after the simulated downlink delay
          const update = {
            x: w.x, y: w.y, angle: w.angle, mass: w.mass,
            boosting: w.boosting, alive: w.alive, lastInputSeq: w.lastInputSeq,
          };
          maybeDelay(() => {
            const wasAlive = this.localAlive;
            this.predictor.reconcile(update);
            this.localAlive = update.alive;
            this.localMassView = update.mass;
            if (!wasAlive && update.alive) {
              // respawned — reset the rendered body so the tail doesn't streak
              this.localRenderer.resetBodyAt(update.x, update.y);
              this.hud.hideDeath();
            }
          });
        });
        return;
      }
      const entry: RemoteEntry = {
        nickname: w.nickname,
        buffer: new SnapshotBuffer(),
        renderer: new WormRenderer(this, w.nickname, false),
      };
      this.remotes.set(key, entry);
      $(w).onChange(() => {
        const snap = {
          x: w.x, y: w.y, angle: w.angle, mass: w.mass,
          boosting: w.boosting, alive: w.alive, nickname: w.nickname,
        };
        maybeDelay(() => {
          entry.nickname = snap.nickname;
          entry.buffer.push({ t: performance.now(), ...snap });
        });
      });
    });

    worms.onRemove((_w, key: string) => {
      const entry = this.remotes.get(key);
      if (entry) {
        entry.renderer.destroy();
        this.remotes.delete(key);
      }
    });

    food.onAdd((f, key: string) => {
      this.food.set(Number(key), {
        kind: f.kind as FoodKind, x: f.x, y: f.y, value: f.value, scale: 1,
      });
    });
    food.onRemove((_f, key: string) => {
      this.food.delete(Number(key));
    });
  }

  private wireMessages(): void {
    const ownId = this.conn.room.sessionId;
    this.conn.onLeaderboard((msg) => {
      this.hud.setLeaderboard(msg, ownId);
      const mine = msg.top.find((e) => e.id === ownId);
      if (mine) this.localScore = mine.score;
    });
    this.conn.onDeath((msg) => {
      this.localAlive = false;
      this.localScore = msg.score;
      this.hud.showDeath(msg);
    });
  }

  private wireInput(): void {
    this.input.on("pointerdown", () => { this.boostHeld = true; });
    this.input.on("pointerup", () => { this.boostHeld = false; });
    const kb = this.input.keyboard;
    if (kb) {
      kb.on("keydown-SPACE", () => { this.boostHeld = true; });
      kb.on("keyup-SPACE", () => { this.boostHeld = false; });
    }
  }

  // ── frame loop ────────────────────────────────────────────────────────────

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);

    if (this.localAlive) {
      const sent = this.predictor.advance(dt, () => this.sampleInput());
      for (const input of sent) maybeDelay(() => this.conn.sendInput(input));
    }

    this.renderLocal();
    this.renderRemotes();
    this.renderFood();
    this.updateCamera(dt);
    this.hud.setScore(this.localScore, this.localMassView);

    // E2E/diagnostics hook (read-only; also feeds the dev perf panel in M3)
    (window as unknown as { __nibblio?: unknown }).__nibblio = {
      alive: this.localAlive,
      mass: this.localMassView,
      score: this.localScore,
      remoteCount: this.remotes.size,
      foodCount: this.food.size,
      predictionError: this.predictor.lastErrorMagnitude,
      pendingInputs: this.predictor.pendingCount,
      x: this.predictor.worm.x,
      y: this.predictor.worm.y,
    };
  }

  private sampleInput(): WormInput {
    const pose = this.predictor.renderPose();
    const pointer = this.input.activePointer;
    let angle = this.predictor.worm.targetAngle;
    if (pointer) {
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const dx = wp.x - pose.x;
      const dy = wp.y - pose.y;
      if (dx * dx + dy * dy > 25) angle = Math.atan2(dy, dx);
    }
    this.inputSeq++;
    return { seq: this.inputSeq, angle: wrapAngle(angle), boost: this.boostHeld };
  }

  private renderLocal(): void {
    const pose = this.predictor.renderPose();
    this.localRenderer.draw(
      pose.x, pose.y, pose.angle,
      this.predictor.worm.mass,
      this.predictor.worm.boosting,
      this.localAlive,
    );
  }

  private renderRemotes(): void {
    const now = performance.now();
    for (const entry of this.remotes.values()) {
      const s = entry.buffer.sample(now);
      if (!s) continue;
      entry.renderer.setNickname(entry.nickname);
      entry.renderer.draw(s.x, s.y, s.angle, s.mass, s.boosting, s.alive);
    }
  }

  private renderFood(): void {
    // redraw visible food each frame into one Graphics (pooled sprites in M2)
    const cam = this.cameras.main;
    const view = cam.worldView;
    const pad = 40;
    this.foodGfx.clear();
    for (const f of this.food.values()) {
      if (
        f.x < view.x - pad || f.x > view.right + pad ||
        f.y < view.y - pad || f.y > view.bottom + pad
      ) {
        continue;
      }
      const r = FOOD[f.kind].radius;
      const color = FOOD_COLORS[f.kind];
      this.foodGfx.fillStyle(color, 0.35);
      this.foodGfx.fillCircle(f.x, f.y, r * 1.7);
      this.foodGfx.fillStyle(color, 1);
      this.foodGfx.fillCircle(f.x, f.y, r);
    }
  }

  private updateCamera(dt: number): void {
    const pose = this.predictor.renderPose();
    const cam = this.cameras.main;
    const alpha = 1 - Math.pow(0.5, dt / CAMERA.smoothHalfLife);
    cam.centerOn(
      cam.midPoint.x + (pose.x - cam.midPoint.x) * alpha,
      cam.midPoint.y + (pose.y - cam.midPoint.y) * alpha,
    );
    const mass = this.predictor.worm.mass;
    const targetZoom = Math.max(
      CAMERA.minZoom,
      CAMERA.baseZoom * Math.pow(WORM.spawnMass / Math.max(mass, WORM.spawnMass), CAMERA.zoomExp),
    );
    cam.setZoom(cam.zoom + (targetZoom - cam.zoom) * alpha * 0.5);
  }
}

let phaserGame: Phaser.Game | null = null;

/** Connect first (failures surface before rendering), then boot Phaser. */
export async function startGame(opts: StartOptions): Promise<void> {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }

  opts.onStatus("Searching for an arena…");
  const conn = await connect(opts.nickname);
  opts.onStatus("Joining arena…");

  await new Promise<void>((resolve) => {
    phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      backgroundColor: GAME.backgroundColor,
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      scene: [],
    });
    phaserGame.events.once(Phaser.Core.Events.READY, () => {
      phaserGame!.scene.add("arena", new ArenaScene(conn), true);
      resolve();
    });
  });
}
