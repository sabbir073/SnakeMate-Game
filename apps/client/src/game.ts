import Phaser from "phaser";
import { getStateCallbacks } from "colyseus.js";
import { CAMERA, FOOD, GAME, NET, WORM } from "@nibblio/config";
import type { FoodKind } from "@nibblio/config";
import { wrapAngle } from "@nibblio/shared";
import type { WormInput } from "@nibblio/game-core";
import { connect } from "./net.js";
import type { Connection } from "./net.js";
import { LocalPredictor } from "./prediction.js";
import { SnapshotBuffer } from "./interpolation.js";
import { WormRenderer } from "./worm-renderer.js";
import { Hud } from "./hud.js";
import { AudioManager } from "./audio.js";
import { MobileControls, isTouchDevice } from "./mobile-controls.js";
import { getSettings } from "./settings.js";
import { DebugPanel } from "./debug-panel.js";
import { CLIENT_VERSION } from "./main.js";

export interface StartOptions {
  nickname: string;
  skinId: string;
  onStatus: (status: string) => void;
}

interface RemoteEntry {
  nickname: string;
  effects: string[];
  buffer: SnapshotBuffer;
  renderer: WormRenderer;
}

interface FoodEntry {
  kind: FoodKind;
  x: number;
  y: number;
  value: number;
  radius: number;
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

/** Sprite display scale per food kind (frame content varies per silhouette). */
const FOOD_SCALE: Record<FoodKind, number> = {
  COMMON: 4.6,
  RARE: 4.4,
  EPIC: 3.6,
  BONUS: 3.2,
  DEATH_LOOT: 4.0,
};

/** Frame-variant counts per kind (wormate-style variety). */
const FOOD_VARIANTS: Record<FoodKind, number> = {
  COMMON: 6, RARE: 3, EPIC: 2, BONUS: 2, DEATH_LOOT: 1,
};

function foodFrame(kind: FoodKind, id: number): string {
  const variants = FOOD_VARIANTS[kind];
  if (variants <= 1) return `food-${kind.toLowerCase()}`;
  return `food-${kind.toLowerCase()}-${id % variants}`;
}

class ArenaScene extends Phaser.Scene {
  private predictor!: LocalPredictor;
  private localRenderer!: WormRenderer;
  private remotes = new Map<string, RemoteEntry>();
  private food = new Map<number, FoodEntry>();
  private foodPool: Phaser.GameObjects.Image[] = [];
  private powerups = new Map<number, { kind: string; x: number; y: number }>();
  private powerupPool: Phaser.GameObjects.Image[] = [];
  private localEffects: string[] = [];
  private hud!: Hud;
  private audio!: AudioManager;
  private mobile: MobileControls | null = null;
  private reconnecting = false;
  private prevBoosting = false;
  private debug!: DebugPanel;
  private pingMs = 0;
  private jitterMs = 0;
  private lastPingSent = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fps = 60;
  private massZoomEased = CAMERA.baseZoom;
  private inputSeq = 0;
  private boostHeld = false;
  private localAlive = true;
  private localMassView = WORM.spawnMass;
  private localScore = 0;

  constructor(
    private readonly conn: Connection,
    private readonly skinId: string,
  ) {
    super("arena");
  }

  preload(): void {
    this.load.atlas("game-atlas", "/assets/game-atlas.png", "/assets/game-atlas.json");
    this.load.image("bg-tile", "/assets/bg-tile.png");
    AudioManager.preload(this);
  }

  create(): void {
    const worldSize = this.conn.welcome.worldSize;
    this.cameras.main.setBackgroundColor(GAME.backgroundColor);

    // generated candy-space background (assets pipeline) + arena border
    this.add
      .tileSprite(worldSize / 2, worldSize / 2, worldSize, worldSize, "bg-tile")
      .setDepth(0);
    const border = this.add.graphics().setDepth(1);
    border.lineStyle(14, 0xe84393, 0.9);
    border.strokeRect(0, 0, worldSize, worldSize);
    border.lineStyle(4, 0xffd166, 0.5);
    border.strokeRect(-9, -9, worldSize + 18, worldSize + 18);

    // local predictor boots at world center; first reconcile snaps to truth
    this.predictor = new LocalPredictor(worldSize / 2, worldSize / 2, 0);
    this.localRenderer = new WormRenderer(this, "", true);
    this.localRenderer.setSkin(this.skinId);

    this.hud = new Hud(() => {
      this.audio.play("ui-click");
      this.conn.requestRespawn();
    });
    this.hud.show();

    this.audio = new AudioManager(this);
    this.audio.startMusic();
    this.audio.play("spawn");

    if (isTouchDevice()) this.mobile = new MobileControls();
    this.debug = new DebugPanel();
    this.startPing();

    this.wireState();
    this.wireMessages();
    this.wireRoomLifecycle();
    this.wireInput();

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.hide();
      this.audio.destroy();
      this.mobile?.destroy();
      this.debug.destroy();
      if (this.pingTimer) clearInterval(this.pingTimer);
      void this.conn.leave();
    });

    // closing the tab is an intentional leave — skip the reconnect grace
    const onPageHide = (): void => {
      void this.conn.leave();
    };
    window.addEventListener("pagehide", onPageHide);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener("pagehide", onPageHide);
    });
  }

  // ── colyseus wiring ───────────────────────────────────────────────────────

  private wireState(): void {
    const $ = getStateCallbacks(this.conn.room);
    const state = this.conn.room.state;
    const worms = $(state).worms;
    const food = $(state).food;
    const powerups = $(state).powerups;
    if (!worms || !food || !powerups) throw new Error("room state missing collections");
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
          const effects = w.effects ? String(w.effects).split(",").filter(Boolean) : [];
          maybeDelay(() => {
            const wasAlive = this.localAlive;
            const prevMass = this.localMassView;
            const prevEffects = this.localEffects;
            this.localEffects = effects;
            this.predictor.setEffects(effects);
            this.predictor.reconcile(update);
            this.localAlive = update.alive;
            this.localMassView = update.mass;
            // sound: ate something (mass up while alive and not from respawn)
            if (wasAlive && update.alive && update.mass > prevMass + 0.5) {
              this.audio.playPickup(update.mass - prevMass);
            }
            // sound: gained a powerup effect
            if (effects.some((e) => !prevEffects.includes(e))) {
              this.audio.play("powerup");
            }
            if (!wasAlive && update.alive) {
              // respawned — reset the rendered body so the tail doesn't streak
              this.localRenderer.resetBodyAt(update.x, update.y);
              this.hud.hideDeath();
              this.audio.play("spawn");
            }
          });
        });
        return;
      }
      const entry: RemoteEntry = {
        nickname: w.nickname,
        effects: [],
        buffer: new SnapshotBuffer(),
        renderer: new WormRenderer(this, w.nickname, false),
      };
      entry.renderer.setSkin(w.skinId ?? "s0");
      this.remotes.set(key, entry);
      $(w).onChange(() => {
        const snap = {
          x: w.x, y: w.y, angle: w.angle, mass: w.mass,
          boosting: w.boosting, alive: w.alive, nickname: w.nickname,
          effects: w.effects ? String(w.effects).split(",").filter(Boolean) : [],
        };
        maybeDelay(() => {
          entry.nickname = snap.nickname;
          entry.effects = snap.effects;
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
      const kind = f.kind as FoodKind;
      this.food.set(Number(key), {
        kind, x: f.x, y: f.y, value: f.value, radius: FOOD[kind].radius,
      });
    });
    food.onRemove((_f, key: string) => {
      this.food.delete(Number(key));
    });

    powerups.onAdd((p, key: string) => {
      this.powerups.set(Number(key), { kind: p.kind, x: p.x, y: p.y });
    });
    powerups.onRemove((_p, key: string) => {
      this.powerups.delete(Number(key));
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
      this.audio.play("death");
    });
  }

  /** Unexpected drop → overlay + resume attempts (spec §74). */
  private wireRoomLifecycle(): void {
    const overlay = document.getElementById("reconnect");
    this.conn.room.onLeave((code) => {
      const consented = code === 1000 || code === 4000;
      if (consented || this.reconnecting) return;
      this.reconnecting = true;
      overlay?.classList.add("visible");
      void this.attemptReconnect(overlay);
    });

    // E2E hook: force-drop the transport without a consented leave
    (window as unknown as { __nibblioDrop?: () => void }).__nibblioDrop = () => {
      interface TransportLike { connection?: { transport?: { ws?: WebSocket } } }
      const ws = (this.conn.room as unknown as TransportLike).connection?.transport?.ws;
      ws?.close(4999);
    };
  }

  private async attemptReconnect(overlay: HTMLElement | null): Promise<void> {
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await this.conn.reconnect();
        // resumed: rebuild all schema bindings against the new room object
        this.resetEntities();
        this.wireState();
        this.wireMessages();
        this.wireRoomLifecycle();
        this.reconnecting = false;
        overlay?.classList.remove("visible");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** attempt, 4000)));
      }
    }
    // grace expired or unreachable — back to home with a friendly message
    overlay?.classList.remove("visible");
    this.reconnecting = false;
    const home = document.getElementById("home");
    const status = document.getElementById("status");
    home?.classList.remove("hidden");
    if (status) status.textContent = "Connection lost. Press PLAY to rejoin.";
    this.game.destroy(true);
  }

  private resetEntities(): void {
    for (const entry of this.remotes.values()) entry.renderer.destroy();
    this.remotes.clear();
    this.food.clear();
    this.powerups.clear();
  }

  private startPing(): void {
    this.conn.room.onMessage("p", (msg: { t: number }) => {
      const rtt = performance.now() - msg.t;
      this.jitterMs = this.jitterMs * 0.7 + Math.abs(rtt - this.pingMs) * 0.3;
      this.pingMs = this.pingMs === 0 ? rtt : this.pingMs * 0.7 + rtt * 0.3;
    });
    this.pingTimer = setInterval(() => {
      if (this.reconnecting) return;
      try {
        this.lastPingSent = performance.now();
        this.conn.room.send("p", { t: this.lastPingSent });
      } catch { /* socket down; reconnect flow handles it */ }
    }, 2000);
  }

  private qualityNow(): "excellent" | "good" | "poor" | "reconnecting" {
    if (this.reconnecting) return "reconnecting";
    const q = NET.quality;
    if (this.pingMs <= q.excellent.ping && this.jitterMs <= q.excellent.jitter) return "excellent";
    if (this.pingMs <= q.good.ping && this.jitterMs <= q.good.jitter) return "good";
    return "poor";
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
    this.renderPowerups();
    this.updateCamera(dt);
    this.hud.setScore(this.localScore, this.localMassView);
    this.hud.setEffects(this.localEffects);

    // fps (1s window) + debug panel at ~4Hz
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 1) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
    if ((this.game.getFrame() & 15) === 0) {
      this.debug.setQuality(this.qualityNow());
      this.debug.update({
        fps: this.fps,
        frameMs: deltaMs,
        visibleEntities: this.foodPool.filter((sp) => sp.visible).length + this.remotes.size + 1,
        totalEntities: this.food.size + this.remotes.size + this.powerups.size + 1,
        pingMs: this.pingMs,
        jitterMs: this.jitterMs,
        serverTick: (this.conn.room.state as { tick?: number }).tick ?? 0,
        predictionError: this.predictor.lastErrorMagnitude,
        pendingInputs: this.predictor.pendingCount,
        clientVersion: CLIENT_VERSION,
        serverVersion: this.conn.welcome.serverVersion,
      });
    }

    // E2E/diagnostics hook (read-only; also feeds the dev perf panel in M3)
    (window as unknown as { __nibblio?: unknown }).__nibblio = {
      reconnecting: this.reconnecting,
      alive: this.localAlive,
      mass: this.localMassView,
      score: this.localScore,
      remoteCount: this.remotes.size,
      foodCount: this.food.size,
      predictionError: this.predictor.lastErrorMagnitude,
      pendingInputs: this.predictor.pendingCount,
      pingMs: this.pingMs,
      x: this.predictor.worm.x,
      y: this.predictor.worm.y,
      renderX: this.predictor.renderPose().x,
      renderY: this.predictor.renderPose().y,
      viewW: this.cameras.main.worldView.width,
      viewH: this.cameras.main.worldView.height,
      camW: this.cameras.main.width,
      camH: this.cameras.main.height,
      camZoom: this.cameras.main.zoom,
    };
  }

  private sampleInput(): WormInput {
    const pose = this.predictor.renderPose();
    let angle = this.predictor.worm.targetAngle;
    const joy = this.mobile?.state.vector;
    if (joy) {
      angle = Math.atan2(joy.y, joy.x);
    } else {
      const pointer = this.input.activePointer;
      if (pointer) {
        const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const dx = wp.x - pose.x;
        const dy = wp.y - pose.y;
        if (dx * dx + dy * dy > 25) angle = Math.atan2(dy, dx);
      }
    }
    const boost = this.boostHeld || (this.mobile?.state.boost ?? false);
    if (boost && !this.prevBoosting) this.audio.play("boost");
    this.prevBoosting = boost;
    this.inputSeq++;
    return { seq: this.inputSeq, angle: wrapAngle(angle), boost };
  }

  private renderLocal(): void {
    const pose = this.predictor.renderPose();
    this.localRenderer.draw(
      pose.x, pose.y, pose.angle,
      this.predictor.worm.mass,
      this.predictor.worm.boosting,
      this.localAlive,
      this.localEffects,
    );
  }

  private renderRemotes(): void {
    const now = performance.now();
    for (const entry of this.remotes.values()) {
      const s = entry.buffer.sample(now);
      if (!s) continue;
      entry.renderer.setNickname(entry.nickname);
      entry.renderer.draw(s.x, s.y, s.angle, s.mass, s.boosting, s.alive, entry.effects);
    }
  }

  private renderFood(): void {
    // pooled atlas sprites, camera-culled; gentle bob for life
    const cam = this.cameras.main;
    const view = cam.worldView;
    const pad = 40;
    const settings = getSettings();
    const animate = settings.quality === "high" && !settings.reducedMotion;
    const bob = animate ? Math.sin(performance.now() / 350) * 0.08 + 1 : 1;
    let used = 0;
    for (const [id, f] of this.food) {
      if (
        f.x < view.x - pad || f.x > view.right + pad ||
        f.y < view.y - pad || f.y > view.bottom + pad
      ) {
        continue;
      }
      let sprite = this.foodPool[used];
      if (!sprite) {
        sprite = this.add.image(0, 0, "game-atlas", "food-common-0").setDepth(3);
        this.foodPool.push(sprite);
      }
      const size = f.radius * FOOD_SCALE[f.kind] * (f.kind === "BONUS" || f.kind === "EPIC" ? 1 : bob);
      const phase = (id % 7) / 7;
      sprite
        .setVisible(true)
        .setFrame(foodFrame(f.kind, id))
        .setPosition(
          f.x,
          f.y + (animate ? Math.sin(performance.now() / 500 + phase * 6.28) * 1.5 : 0),
        )
        .setDisplaySize(size, size);
      used++;
    }
    for (let i = used; i < this.foodPool.length; i++) this.foodPool[i]!.setVisible(false);
  }

  private renderPowerups(): void {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const pad = 60;
    const q = getSettings();
    const pulse = q.quality === "high" && !q.reducedMotion
      ? 1 + 0.12 * Math.sin(performance.now() / 240)
      : 1;
    let used = 0;
    for (const p of this.powerups.values()) {
      if (
        p.x < view.x - pad || p.x > view.right + pad ||
        p.y < view.y - pad || p.y > view.bottom + pad
      ) {
        continue;
      }
      let sprite = this.powerupPool[used];
      if (!sprite) {
        sprite = this.add.image(0, 0, "game-atlas", "powerup-speed").setDepth(4);
        this.powerupPool.push(sprite);
      }
      const size = 54 * pulse;
      sprite
        .setVisible(true)
        .setFrame(`powerup-${p.kind.toLowerCase()}`)
        .setPosition(p.x, p.y)
        .setDisplaySize(size, size)
        .setRotation(Math.sin(performance.now() / 900) * 0.12);
      used++;
    }
    for (let i = used; i < this.powerupPool.length; i++) this.powerupPool[i]!.setVisible(false);
  }

  private updateCamera(dt: number): void {
    const pose = this.predictor.renderPose();
    const cam = this.cameras.main;
    const alpha = 1 - Math.pow(0.5, dt / CAMERA.smoothHalfLife);
    cam.centerOn(
      cam.midPoint.x + (pose.x - cam.midPoint.x) * alpha,
      cam.midPoint.y + (pose.y - cam.midPoint.y) * alpha,
    );

    // mass-based zoom-out (eased), floored; ZOOM powerup widens the view —
    // the ease-in/out of this factor IS the wormate-style zoom animation
    const mass = this.predictor.worm.mass;
    let massZoom = Math.max(
      CAMERA.minZoom,
      CAMERA.baseZoom * Math.pow(WORM.spawnMass / Math.max(mass, WORM.spawnMass), CAMERA.zoomExp),
    );
    if (this.localEffects.includes("ZOOM")) massZoom /= CAMERA.zoomPowerupFactor;
    this.massZoomEased += (massZoom - this.massZoomEased) * alpha * 0.5;

    // fairness normalization, applied INSTANTLY: the visible world area is
    // constant regardless of canvas size — resizing or browser-zooming can
    // never reveal more of the map (anti-cheat).
    const viewScale = Math.max(
      cam.width / CAMERA.viewRefWidth,
      cam.height / CAMERA.viewRefHeight,
    );
    cam.setZoom(this.massZoomEased * viewScale);
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
  const conn = await connect(opts.nickname, opts.skinId);
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
      phaserGame!.scene.add("arena", new ArenaScene(conn, opts.skinId), true);
      resolve();
    });
  });
}
