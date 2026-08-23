import Phaser from "phaser";
import { getStateCallbacks } from "colyseus.js";
import { CAMERA, GAME, NET, WORM } from "@nibblio/config";
import { lerpAngle, wrapAngle } from "@nibblio/shared";
import { radiusForMass, lengthForMass } from "@nibblio/game-core";
import { connect } from "./net.js";
import type { Connection } from "./net.js";

/** M0 arena scene — renders authoritative state with exponential smoothing and
 *  sends pointer-follow inputs. M1 replaces the smoothing model with client
 *  prediction (local worm) + snapshot interpolation (remote worms). */

interface RenderWorm {
  id: string;
  nickname: string;
  // latest authoritative state
  tx: number;
  ty: number;
  tangle: number;
  mass: number;
  alive: boolean;
  boosting: boolean;
  // rendered (smoothed) state
  x: number;
  y: number;
  angle: number;
  segments: Array<{ x: number; y: number }>;
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

export interface StartOptions {
  nickname: string;
  onStatus: (status: string) => void;
}

class ArenaScene extends Phaser.Scene {
  private worms = new Map<string, RenderWorm>();
  private inputSeq = 0;
  private inputTimer = 0;
  private boostHeld = false;

  constructor(private readonly conn: Connection) {
    super("arena");
  }

  create(): void {
    const worldSize = this.conn.welcome.worldSize;
    this.cameras.main.setBackgroundColor(GAME.backgroundColor);

    // background grid + border — placeholder decor until the art pass (M2)
    this.add.grid(
      worldSize / 2, worldSize / 2, worldSize, worldSize, 160, 160,
      0x160b33, 1, 0x241348, 0.6,
    );
    const border = this.add.graphics();
    border.lineStyle(12, 0xe84393, 0.9);
    border.strokeRect(0, 0, worldSize, worldSize);

    this.wireState();
    this.wireInput();

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      void this.conn.leave();
    });
  }

  private wireState(): void {
    const $ = getStateCallbacks(this.conn.room);
    const state = this.conn.room.state;
    const worms = $(state).worms;
    if (!worms) throw new Error("room state missing worms collection");

    worms.onAdd((w, key: string) => {
      const worm: RenderWorm = {
        id: key,
        nickname: w.nickname,
        tx: w.x, ty: w.y, tangle: w.angle,
        mass: w.mass, alive: w.alive, boosting: w.boosting,
        x: w.x, y: w.y, angle: w.angle,
        segments: [],
        gfx: this.add.graphics(),
        label: this.add
          .text(0, 0, w.nickname, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            color: "#ffffff",
          })
          .setOrigin(0.5, 1.6)
          .setAlpha(0.85),
      };
      this.worms.set(key, worm);
      $(w).onChange(() => {
        worm.nickname = w.nickname;
        worm.tx = w.x;
        worm.ty = w.y;
        worm.tangle = w.angle;
        worm.mass = w.mass;
        worm.alive = w.alive;
        worm.boosting = w.boosting;
      });
    });

    worms.onRemove((_w, key: string) => {
      const worm = this.worms.get(key);
      if (worm) {
        worm.gfx.destroy();
        worm.label.destroy();
        this.worms.delete(key);
      }
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

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    this.sendInputs(dt);
    this.renderWorms(dt);
    this.updateCamera(dt);
  }

  private sendInputs(dt: number): void {
    this.inputTimer += dt;
    const interval = 1 / NET.inputRate;
    if (this.inputTimer < interval) return;
    this.inputTimer %= interval;

    const me = this.worms.get(this.conn.room.sessionId);
    const pointer = this.input.activePointer;
    let angle = me?.angle ?? 0;
    if (me && pointer) {
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const dx = wp.x - me.x;
      const dy = wp.y - me.y;
      if (dx * dx + dy * dy > 25) angle = Math.atan2(dy, dx);
    }
    this.inputSeq++;
    this.conn.sendInput({ seq: this.inputSeq, angle: wrapAngle(angle), boost: this.boostHeld });
  }

  private renderWorms(dt: number): void {
    const alpha = 1 - Math.exp(-dt * 12);

    for (const w of this.worms.values()) {
      w.x += (w.tx - w.x) * alpha;
      w.y += (w.ty - w.y) * alpha;
      w.angle = lerpAngle(w.angle, w.tangle, alpha);

      w.gfx.clear();
      w.label.setPosition(w.x, w.y);
      if (!w.alive) {
        w.label.setVisible(false);
        continue;
      }
      w.label.setVisible(true);
      w.label.setText(w.nickname);

      const radius = radiusForMass(w.mass);
      const length = lengthForMass(w.mass);
      const spacing = WORM.segmentSpacing;
      const count = Math.max(3, Math.floor(length / spacing));

      // follow-the-leader body reconstruction (render-side only)
      if (w.segments.length !== count) {
        const last = w.segments[w.segments.length - 1] ?? { x: w.x, y: w.y };
        while (w.segments.length < count) w.segments.push({ x: last.x, y: last.y });
        w.segments.length = count;
      }
      let px = w.x;
      let py = w.y;
      for (const seg of w.segments) {
        const dx = px - seg.x;
        const dy = py - seg.y;
        const d = Math.hypot(dx, dy);
        if (d > spacing) {
          const t = (d - spacing) / d;
          seg.x += dx * t;
          seg.y += dy * t;
        }
        px = seg.x;
        py = seg.y;
      }

      const bodyColor = w.boosting ? 0xffe08a : 0xffb545;
      for (let i = w.segments.length - 1; i >= 0; i--) {
        const seg = w.segments[i]!;
        const r = radius * (1 - (i / w.segments.length) * 0.35);
        w.gfx.fillStyle(bodyColor, 1);
        w.gfx.fillCircle(seg.x, seg.y, r);
      }
      // head + placeholder eyes (replaced by real art in M2)
      w.gfx.fillStyle(bodyColor, 1);
      w.gfx.fillCircle(w.x, w.y, radius * 1.08);
      const ex = Math.cos(w.angle + Math.PI / 2) * radius * 0.45;
      const ey = Math.sin(w.angle + Math.PI / 2) * radius * 0.45;
      const fx = Math.cos(w.angle) * radius * 0.35;
      const fy = Math.sin(w.angle) * radius * 0.35;
      w.gfx.fillStyle(0xffffff, 1);
      w.gfx.fillCircle(w.x + fx + ex, w.y + fy + ey, radius * 0.28);
      w.gfx.fillCircle(w.x + fx - ex, w.y + fy - ey, radius * 0.28);
      w.gfx.fillStyle(0x1a1a2e, 1);
      w.gfx.fillCircle(w.x + fx * 1.3 + ex, w.y + fy * 1.3 + ey, radius * 0.13);
      w.gfx.fillCircle(w.x + fx * 1.3 - ex, w.y + fy * 1.3 - ey, radius * 0.13);
    }
  }

  private updateCamera(dt: number): void {
    const me = this.worms.get(this.conn.room.sessionId);
    if (!me) return;
    const cam = this.cameras.main;
    const alpha = 1 - Math.pow(0.5, dt / CAMERA.smoothHalfLife);
    cam.centerOnX(cam.midPoint.x + (me.x - cam.midPoint.x) * alpha);
    cam.centerOnY(cam.midPoint.y + (me.y - cam.midPoint.y) * alpha);

    const targetZoom = Math.max(
      CAMERA.minZoom,
      CAMERA.baseZoom * Math.pow(WORM.spawnMass / Math.max(me.mass, WORM.spawnMass), CAMERA.zoomExp),
    );
    cam.setZoom(cam.zoom + (targetZoom - cam.zoom) * alpha * 0.5);
  }
}

let phaserGame: Phaser.Game | null = null;

/** Connect first (so failures surface before any rendering), then boot Phaser. */
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
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: "100%",
        height: "100%",
      },
      scene: [],
    });
    phaserGame.events.once(Phaser.Core.Events.READY, () => {
      phaserGame!.scene.add("arena", new ArenaScene(conn), true);
      resolve();
    });
  });
}
