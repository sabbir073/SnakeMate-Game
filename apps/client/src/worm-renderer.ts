import Phaser from "phaser";
import { skinById } from "@nibblio/config";
import { lengthForMass, radiusForMass } from "@nibblio/game-core";
import { PathTracker } from "./path-tracker.js";
import type { PathPoint } from "./path-tracker.js";

/** Sprite circle content radius inside a 256px master (r = 0.42 * 256),
 *  rendered into square frames — display size compensates so the drawn circle
 *  matches the sim radius exactly. */
const SPRITE_CONTENT_RATIO = 1 / (2 * 0.42);
/** Render-side segment spacing (wu) for a continuous, premium-looking tube.
 *  Grows for huge worms so per-worm sprite count stays bounded. */
const RENDER_SPACING_BASE = 9;
const MAX_SEGMENTS = 110;

function blendToWhite(color: number, t: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const f = (c: number): number => Math.round(c + (255 - c) * t);
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** Draws one worm from atlas sprites: skinned head (rotates with heading),
 *  follow-the-leader body segments, DOM-crisp nameplate. */
export class WormRenderer {
  private readonly path = new PathTracker();
  private readonly scratch: PathPoint = { x: 0, y: 0 };
  private bodySprites: Phaser.GameObjects.Image[] = [];
  private head: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private aura: Phaser.GameObjects.Graphics;
  private boostGlow: Phaser.GameObjects.Image;
  private skinId = "";
  private rings: readonly number[] = [0xffb545];
  private baseTint = 0xffb545;
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
    this.aura = scene.add.graphics().setDepth(this.depthBase + 2);
    this.boostGlow = scene.add
      .image(0, 0, "game-atlas", "fx-glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.depthBase - 0.5)
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
    const skin = skinById(skinId);
    this.skinId = skin.id;
    this.rings = skin.rings;
    this.baseTint = skin.baseTint;
    this.head.setFrame(`worm-head-${this.skinId}`);
  }

  draw(
    x: number, y: number, angle: number, mass: number,
    boosting: boolean, alive: boolean, effects: readonly string[] = [],
  ): void {
    if (!alive) {
      this.head.setVisible(false);
      this.label.setVisible(false);
      this.boostGlow.setVisible(false);
      this.aura.clear();
      for (const s of this.bodySprites) s.setVisible(false);
      return;
    }
    if (this.skinId === "") this.setSkin("s0");

    this.label.setVisible(true);
    this.label.setPosition(x, y);

    const radius = radiusForMass(mass);
    const length = lengthForMass(mass);
    const spacing = Math.max(RENDER_SPACING_BASE, length / MAX_SEGMENTS);
    const count = Math.max(4, Math.floor(length / spacing));
    const displaySize = radius * 2 * SPRITE_CONTENT_RATIO;

    // record the head's trajectory; segments sample the ACTUAL path so the
    // whole body (tail included) flows through coils instead of sticking
    this.path.record(x, y, angle, length + spacing * 2);

    // maintain sprite pool — grayscale ring frame tinted per skin pattern
    while (this.bodySprites.length < count) {
      this.bodySprites.push(
        this.scene.add
          .image(0, 0, "game-atlas", "worm-ring")
          .setDepth(this.depthBase),
      );
    }
    const ringCount = this.rings.length;
    // band width scales with the worm so rings stay chunky at any size
    const bandWidth = Math.max(radius * 1.7, 16);
    for (let i = 0; i < this.bodySprites.length; i++) {
      const sprite = this.bodySprites[i]!;
      if (i >= count) {
        sprite.setVisible(false);
        continue;
      }
      this.path.pointAt((i + 1) * spacing, x, y, this.scratch);
      // gentle taper only in the last third — reads as a tube, not beads
      const tailZone = i / count;
      const taper = tailZone < 0.66 ? 1 : 1 - ((tailZone - 0.66) / 0.34) * 0.4;
      const ringTint = this.rings[Math.floor((i * spacing) / bandWidth) % ringCount] ?? this.baseTint;
      sprite
        .setVisible(true)
        .setPosition(this.scratch.x, this.scratch.y)
        .setDisplaySize(displaySize * taper, displaySize * taper)
        .setDepth(this.depthBase + (count - i) / (count + 1)) // head-side on top
        .setTint(boosting ? blendToWhite(ringTint, 0.3) : ringTint);
    }

    this.head
      .setVisible(true)
      .setPosition(x, y)
      .setRotation(angle)
      .setDisplaySize(displaySize * 1.22, displaySize * 1.22);
    if (boosting) this.head.setTint(0xfff1c9);
    else this.head.clearTint();

    // premium boost feedback: additive glow trailing the whole head
    if (boosting) {
      const pulse = 0.5 + 0.15 * Math.sin(performance.now() / 90);
      this.boostGlow
        .setVisible(true)
        .setPosition(x, y)
        .setTint(this.baseTint)
        .setAlpha(pulse)
        .setDisplaySize(displaySize * 3.2, displaySize * 3.2);
    } else {
      this.boostGlow.setVisible(false);
    }

    this.drawAuras(x, y, angle, radius, effects);
  }

  /** Wormate-style active-effect animations around the head (spec §43). */
  private drawAuras(
    x: number, y: number, angle: number, radius: number, effects: readonly string[],
  ): void {
    this.aura.clear();
    if (effects.length === 0) return;
    const t = performance.now() / 1000;

    if (effects.includes("SHIELD")) {
      // breathing bubble with a bright rim highlight
      const r = radius * 2.1 + Math.sin(t * 4) * radius * 0.12;
      this.aura.fillStyle(0x8bd3ff, 0.14);
      this.aura.fillCircle(x, y, r);
      this.aura.lineStyle(4, 0x8bd3ff, 0.85);
      this.aura.strokeCircle(x, y, r);
      this.aura.lineStyle(3, 0xffffff, 0.7);
      this.aura.beginPath();
      this.aura.arc(x, y, r * 0.92, -2.4, -1.2);
      this.aura.strokePath();
    }

    if (effects.includes("MAGNET")) {
      // two expanding, fading pull-rings
      for (const phase of [0, 0.5]) {
        const u = (t * 1.2 + phase) % 1;
        const r = radius * (1.4 + u * 2.6);
        this.aura.lineStyle(3.5, 0xff5d73, 0.75 * (1 - u));
        this.aura.strokeCircle(x, y, r);
      }
    }

    if (effects.includes("SPEED")) {
      // motion streaks trailing behind the heading
      const back = angle + Math.PI;
      for (let i = 0; i < 3; i++) {
        const side = (i - 1) * 0.55;
        const sx = x + Math.cos(back + side) * radius * 1.7;
        const sy = y + Math.sin(back + side) * radius * 1.7;
        const flick = (t * 6 + i) % 1;
        const len = radius * (1.1 + flick * 0.8);
        this.aura.lineStyle(4, 0xffd166, 0.8 * (1 - flick * 0.5));
        this.aura.lineBetween(
          sx, sy,
          sx + Math.cos(back) * len, sy + Math.sin(back) * len,
        );
      }
    }

    if (effects.includes("DOUBLE_GROWTH")) {
      // green sparkles orbiting the head
      for (let i = 0; i < 4; i++) {
        const a = t * 2.2 + (i / 4) * Math.PI * 2;
        const rr = radius * 1.9;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr * 0.8;
        const s = radius * 0.22 * (0.8 + 0.4 * Math.sin(t * 8 + i));
        this.aura.fillStyle(0x5ce685, 0.9);
        this.aura.fillCircle(px, py, s);
      }
    }

    if (effects.includes("SCORE_MULTIPLIER")) {
      // golden stars orbiting opposite-phase
      for (let i = 0; i < 2; i++) {
        const a = -t * 2.8 + i * Math.PI;
        const px = x + Math.cos(a) * radius * 2.2;
        const py = y + Math.sin(a) * radius * 2.2;
        this.drawStar(px, py, radius * 0.34, 0xffd166);
      }
    }

    if (effects.includes("BOOST_REDUCTION")) {
      // ember dots drifting off the tail direction
      const back = angle + Math.PI;
      for (let i = 0; i < 3; i++) {
        const u = (t * 1.6 + i / 3) % 1;
        const px = x + Math.cos(back + (i - 1) * 0.4) * radius * (1.5 + u * 1.8);
        const py = y + Math.sin(back + (i - 1) * 0.4) * radius * (1.5 + u * 1.8);
        this.aura.fillStyle(0xff8a5c, 0.85 * (1 - u));
        this.aura.fillCircle(px, py, radius * 0.2 * (1 - u * 0.5));
      }
    }

    if (effects.includes("ZOOM")) {
      // expanding view-ring pulse (the camera tween is the primary feedback)
      const u = (t * 0.9) % 1;
      this.aura.lineStyle(3, 0xffe066, 0.6 * (1 - u));
      this.aura.strokeCircle(x, y, radius * (2.2 + u * 2.2));
    }
  }

  private drawStar(cx: number, cy: number, r: number, color: number): void {
    this.aura.fillStyle(color, 0.95);
    this.aura.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) this.aura.moveTo(px, py);
      else this.aura.lineTo(px, py);
    }
    this.aura.closePath();
    this.aura.fillPath();
  }

  /** Reseed the body path at a pose (respawn/teleport). */
  resetBodyAt(x: number, y: number, angle = 0, mass = 10): void {
    this.path.reset(x, y, angle, lengthForMass(mass) + 20);
  }

  destroy(): void {
    this.head.destroy();
    this.label.destroy();
    this.aura.destroy();
    this.boostGlow.destroy();
    for (const s of this.bodySprites) s.destroy();
    this.bodySprites.length = 0;
  }
}
