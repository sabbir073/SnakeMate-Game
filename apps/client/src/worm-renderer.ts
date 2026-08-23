import Phaser from "phaser";
import { WORM } from "@nibblio/config";
import { lengthForMass, radiusForMass } from "@nibblio/game-core";

/** Draws one worm (head + follow-the-leader body + eyes + nameplate).
 *  Placeholder vector look — replaced by skinned atlas sprites in M2. */
export class WormRenderer {
  private segments: Array<{ x: number; y: number }> = [];
  private gfx: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, nickname: string, private readonly isLocal: boolean) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(isLocal ? 10 : 5);
    this.label = scene.add
      .text(0, 0, nickname, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#12082b",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1.9)
      .setAlpha(0.9)
      .setDepth(20);
  }

  setNickname(name: string): void {
    if (this.label.text !== name) this.label.setText(name);
  }

  draw(x: number, y: number, angle: number, mass: number, boosting: boolean, alive: boolean): void {
    this.gfx.clear();
    if (!alive) {
      this.label.setVisible(false);
      return;
    }
    this.label.setVisible(true);
    this.label.setPosition(x, y);

    const radius = radiusForMass(mass);
    const length = lengthForMass(mass);
    const spacing = WORM.segmentSpacing;
    const count = Math.max(3, Math.floor(length / spacing));

    if (this.segments.length !== count) {
      const last = this.segments[this.segments.length - 1] ?? { x, y };
      while (this.segments.length < count) this.segments.push({ x: last.x, y: last.y });
      this.segments.length = count;
    }
    let px = x;
    let py = y;
    for (const seg of this.segments) {
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

    const base = this.isLocal ? 0xffb545 : 0x9d6bff;
    const bodyColor = boosting ? 0xffe08a : base;
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i]!;
      const r = radius * (1 - (i / this.segments.length) * 0.35);
      this.gfx.fillStyle(bodyColor, 1);
      this.gfx.fillCircle(seg.x, seg.y, r);
    }
    // head + eyes
    this.gfx.fillStyle(bodyColor, 1);
    this.gfx.fillCircle(x, y, radius * 1.08);
    const ex = Math.cos(angle + Math.PI / 2) * radius * 0.45;
    const ey = Math.sin(angle + Math.PI / 2) * radius * 0.45;
    const fx = Math.cos(angle) * radius * 0.35;
    const fy = Math.sin(angle) * radius * 0.35;
    this.gfx.fillStyle(0xffffff, 1);
    this.gfx.fillCircle(x + fx + ex, y + fy + ey, radius * 0.28);
    this.gfx.fillCircle(x + fx - ex, y + fy - ey, radius * 0.28);
    this.gfx.fillStyle(0x1a1a2e, 1);
    this.gfx.fillCircle(x + fx * 1.3 + ex, y + fy * 1.3 + ey, radius * 0.13);
    this.gfx.fillCircle(x + fx * 1.3 - ex, y + fy * 1.3 - ey, radius * 0.13);
  }

  /** Reset body to a point (used on respawn/teleport so the tail doesn't streak). */
  resetBodyAt(x: number, y: number): void {
    for (const seg of this.segments) {
      seg.x = x;
      seg.y = y;
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.label.destroy();
  }
}
