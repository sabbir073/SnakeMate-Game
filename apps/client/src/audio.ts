import Phaser from "phaser";
import { assetUrl } from "./assets.js";
import { getSettings, onSettingsChange } from "./settings.js";

/** Controlled audio manager (spec §44–45): volume buses, sound-spam
 *  throttling with pitch variation, mobile unlock via Phaser's built-in
 *  unlock-on-gesture, music loop. */

const SFX_KEYS = [
  "ui-click", "food-pickup", "food-big", "boost", "powerup",
  "death", "kill", "spawn", "rank-up",
] as const;
export type SfxKey = (typeof SFX_KEYS)[number];

/** Minimum ms between plays of the same key (anti-spam, spec §45). */
const THROTTLE: Partial<Record<SfxKey, number>> = {
  "food-pickup": 70,
  boost: 350,
  "ui-click": 60,
};

export class AudioManager {
  private lastPlayed = new Map<string, number>();
  private music?: Phaser.Sound.BaseSound;
  private unsub: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    this.unsub = onSettingsChange(() => this.applyVolumes());
  }

  static preload(scene: Phaser.Scene): void {
    for (const key of SFX_KEYS) scene.load.audio(key, assetUrl(`/assets/audio/${key}.mp3`));
    scene.load.audio("music", assetUrl("/assets/audio/music.mp3"));
  }

  startMusic(): void {
    if (this.music) return;
    const { musicVol } = getSettings();
    this.music = this.scene.sound.add("music", { loop: true, volume: musicVol * 0.6 });
    // Phaser unlocks WebAudio on the first user gesture automatically; if
    // still locked, play once unlocked.
    if (this.scene.sound.locked) {
      this.scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.music?.play());
    } else {
      this.music.play();
    }
  }

  play(key: SfxKey, opts: { detuneCents?: number; volume?: number } = {}): void {
    const { sfxVol } = getSettings();
    if (sfxVol <= 0) return;
    const now = performance.now();
    const throttle = THROTTLE[key] ?? 0;
    const last = this.lastPlayed.get(key) ?? -Infinity;
    if (now - last < throttle) return;
    this.lastPlayed.set(key, now);
    try {
      this.scene.sound.play(key, {
        volume: (opts.volume ?? 1) * sfxVol,
        detune: opts.detuneCents ?? 0,
      });
    } catch { /* audio context unavailable — never break the game for sound */ }
  }

  /** Food pickups get slight random-ish pitch so streaks feel alive. */
  playPickup(value: number): void {
    if (value >= 8) {
      this.play("food-big");
    } else {
      const detune = ((performance.now() % 7) - 3) * 40;
      this.play("food-pickup", { detuneCents: detune, volume: 0.8 });
    }
  }

  private applyVolumes(): void {
    const { musicVol } = getSettings();
    if (this.music && "setVolume" in this.music) {
      (this.music as Phaser.Sound.WebAudioSound).setVolume(musicVol * 0.6);
    }
  }

  destroy(): void {
    this.unsub();
    this.music?.stop();
    this.music?.destroy();
    this.music = undefined;
  }
}
