import Phaser from "phaser";
import { WORM, skinById } from "@nibblio/config";
import { lengthForMass, radiusForMass } from "@nibblio/game-core";

/** Sprite circle content radius inside a 256px master (r = 0.42 * 256),
 *  rendered into square frames — display size compensates so the drawn circle
 *  matches the sim radius exactly. */
const SPRITE_CONTENT_RATIO = 1 / (2 * 0.42);

/** Draws one worm from atlas sprites: skinned head (rotates with heading),
 *  follow-the-leader body segments, DOM-crisp nameplate. */
export class WormRenderer {
  private segments: Array<{ x: number; y: number }> = [];
  private bodySprites: Phaser.GameObjects.Image[] = [];
  private head: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private shieldRing: Phaser.GameObjects.Arc;
  private skinId = "";
  private readonly depthBase: number;

  constructor(
    private readonly scene: Phaser.Scene,
    nickname: string,
    isLocal: boolean,
  ) {
    this.depthBase = isLocal ? 10 : 5;
    this.head = scene.add
      .image(0, 0, "game-atlas", "worm-head-s0")
      .setDepth(this.depthBase + 1)
      .setVisible(false);
    this.shieldRing = scene.add
      .circle(0, 0, 40)
      .setStrokeStyle(5, 0x8bd3ff, 0.9)
      .setDepth(this.depthBase + 2)
      .setVisible(false);
    this.label = scene.add
      .text(0, 0, nickname, {
        fontFamily: "'Baloo 2', system-ui, sans-serif",
        fontSize: "15px",
        color: "#ffffff",
        stroke: "#12082b",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 2.1)
      .setAlpha(0.92)
      .setDepth(20);
  }

  setNickname(name: string): void {
    if (this.label.text !== name) this.label.setText(name);
  }

  setSkin(skinId: string): void {
    if (this.skinId === skinId) return;
    this.skinId = skinById(skinId).id;
    this.head.setFrame(`worm-head-${this.skinId}`);
    for (const s of this.bodySprites) s.setFrame(`worm-body-${this.skinId}`);
  }

  draw(
    x: number, y: number, angle: number, mass: number,
    boosting: boolean, alive: boolean, shielded = false,
  ): void {
    if (!alive) {
      this.head.setVisible(false);
      this.label.setVisible(false);
      this.shieldRing.setVisible(false);
      for (const s of this.bodySprites) s.setVisible(false);
      return;
    }
    if (this.skinId === "") this.setSkin("s0");

    this.label.setVisible(true);
    this.label.setPosition(x, y);

    const radius = radiusForMass(mass);
    const length = lengthForMass(mass);
    const spacing = WORM.segmentSpacing;
    const count = Math.max(3, Math.floor(length / spacing));
    const displaySize = radius * 2 * SPRITE_CONTENT_RATIO;

    // maintain segment positions
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

    // maintain sprite pool
    while (this.bodySprites.length < count) {
      this.bodySprites.push(
        this.scene.add
          .image(0, 0, "game-atlas", `worm-body-${this.skinId || "s0"}`)
          .setDepth(this.depthBase),
      );
    }
    for (let i = 0; i < this.bodySprites.length; i++) {
      const sprite = this.bodySprites[i]!;
      if (i >= count) {
        sprite.setVisible(false);
        continue;
      }
      const seg = this.segments[i]!;
      const taper = 1 - (i / count) * 0.35;
      sprite
        .setVisible(true)
        .setPosition(seg.x, seg.y)
        .setDisplaySize(displaySize * taper, displaySize * taper)
        .setDepth(this.depthBase + (count - i) / (count + 1)) // head-side segments on top
        .setAlpha(boosting ? 0.96 : 1);
      if (boosting) sprite.setTint(0xfff1c9);
      else sprite.clearTint();
    }

    this.head
      .setVisible(true)
      .setPosition(x, y)
      .setRotation(angle)
      .setDisplaySize(displaySize * 1.12, displaySize * 1.12);
    if (boosting) this.head.setTint(0xfff1c9);
    else this.head.clearTint();

    this.shieldRing.setVisible(shielded);
    if (shielded) {
      this.shieldRing.setPosition(x, y).setRadius(radius * 1.9);
    }
  }

  /** Reset body to a point (respawn/teleport) so the tail doesn't streak. */
  resetBodyAt(x: number, y: number): void {
    for (const seg of this.segments) {
      seg.x = x;
      seg.y = y;
    }
  }

  destroy(): void {
    this.head.destroy();
    this.label.destroy();
    this.shieldRing.destroy();
    for (const s of this.bodySprites) s.destroy();
    this.bodySprites.length = 0;
  }
}
