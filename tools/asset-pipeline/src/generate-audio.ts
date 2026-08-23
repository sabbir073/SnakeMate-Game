/** Original audio synthesis (spec §44, §140 — see docs/AUDIO_STYLE.md).
 *  All SFX + the music loop are synthesized procedurally (deterministic,
 *  zero third-party material), written as WAV, then encoded to MP3 via ffmpeg
 *  into assets/audio for browser delivery. */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { paths } from "./paths.js";

const SR = 44100;

type Samples = Float32Array;

function seconds(n: number): Samples {
  return new Float32Array(Math.round(n * SR));
}

function mix(base: Samples, add: Samples, at = 0, gain = 1): void {
  const off = Math.round(at * SR);
  for (let i = 0; i < add.length && off + i < base.length; i++) {
    base[off + i]! += add[i]! * gain;
  }
}

/** Simple deterministic noise (mulberry-ish). */
function makeNoise(len: number, seed = 1): Samples {
  const out = new Float32Array(len);
  let s = seed >>> 0;
  for (let i = 0; i < len; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return out;
}

interface ToneOpts {
  shape?: "sine" | "square" | "triangle" | "saw";
  attack?: number;
  decay?: number; // exponential decay constant (per second)
  gain?: number;
  /** end frequency for a linear pitch glide */
  freqEnd?: number;
}

function tone(freq: number, dur: number, opts: ToneOpts = {}): Samples {
  const { shape = "sine", attack = 0.004, decay = 8, gain = 1, freqEnd } = opts;
  const out = seconds(dur);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = freqEnd === undefined ? freq : freq + (freqEnd - freq) * (t / dur);
    phase += (2 * Math.PI * f) / SR;
    let v: number;
    switch (shape) {
      case "square": v = Math.sign(Math.sin(phase)) * 0.5; break;
      case "triangle": v = (2 / Math.PI) * Math.asin(Math.sin(phase)); break;
      case "saw": v = ((phase / Math.PI) % 2) - 1; break;
      default: v = Math.sin(phase);
    }
    const env = Math.min(1, t / attack) * Math.exp(-decay * t);
    out[i] = v * env * gain;
  }
  return out;
}

function normalize(s: Samples, peak = 0.85): Samples {
  let max = 0;
  for (const v of s) max = Math.max(max, Math.abs(v));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < s.length; i++) s[i]! *= k;
  }
  return s;
}

function toWav(samples: Samples): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i]! * 32767))), 44 + i * 2);
  }
  return buf;
}

// ── the sound set ────────────────────────────────────────────────────────────

function sfxClick(): Samples {
  const s = seconds(0.07);
  mix(s, tone(1250, 0.05, { shape: "triangle", decay: 60, gain: 0.7 }));
  mix(s, tone(2400, 0.02, { decay: 120, gain: 0.25 }));
  return normalize(s, 0.6);
}

function sfxPickup(): Samples {
  const s = seconds(0.12);
  mix(s, tone(640, 0.1, { freqEnd: 340, decay: 30, gain: 0.9 }));
  return normalize(s, 0.55);
}

function sfxPickupBig(): Samples {
  const s = seconds(0.4);
  mix(s, tone(523, 0.22, { shape: "triangle", decay: 12 }));
  mix(s, tone(659, 0.24, { shape: "triangle", decay: 12 }), 0.07);
  mix(s, tone(1047, 0.28, { decay: 10, gain: 0.6 }), 0.14);
  return normalize(s, 0.65);
}

function sfxBoost(): Samples {
  const dur = 0.5;
  const s = seconds(dur);
  const noise = makeNoise(s.length, 7);
  // band-ish filter by mixing detuned saws + shaped noise swell
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const env = Math.sin((t / dur) * Math.PI) ** 1.5;
    s[i] = noise[i]! * env * 0.28;
  }
  mix(s, tone(160, dur, { shape: "saw", freqEnd: 420, decay: 2.2, gain: 0.4 }));
  return normalize(s, 0.5);
}

function sfxPowerup(): Samples {
  const s = seconds(0.5);
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => mix(s, tone(f, 0.18, { decay: 14, gain: 0.8 }), i * 0.085));
  mix(s, tone(2093, 0.2, { decay: 16, gain: 0.3 }), 0.34);
  return normalize(s, 0.6);
}

function sfxDeath(): Samples {
  const s = seconds(0.7);
  mix(s, tone(220, 0.6, { shape: "saw", freqEnd: 60, decay: 5, gain: 0.8 }));
  const thump = makeNoise(Math.round(0.12 * SR), 3);
  for (let i = 0; i < thump.length; i++) thump[i]! *= Math.exp(-24 * (i / SR)) * 0.8;
  mix(s, thump, 0);
  return normalize(s, 0.7);
}

function sfxKill(): Samples {
  const s = seconds(0.45);
  mix(s, tone(392, 0.16, { shape: "square", decay: 14, gain: 0.5 }));
  mix(s, tone(587, 0.18, { shape: "square", decay: 13, gain: 0.5 }), 0.09);
  mix(s, tone(880, 0.24, { decay: 10, gain: 0.55 }), 0.18);
  return normalize(s, 0.6);
}

function sfxSpawn(): Samples {
  const s = seconds(0.3);
  mix(s, tone(240, 0.26, { freqEnd: 560, shape: "triangle", decay: 8, gain: 0.8 }));
  return normalize(s, 0.55);
}

function sfxRankUp(): Samples {
  const s = seconds(0.6);
  [523, 659, 784].forEach((f, i) => mix(s, tone(f, 0.3, { shape: "triangle", decay: 8 }), i * 0.1));
  mix(s, tone(1568, 0.25, { decay: 12, gain: 0.35 }), 0.3);
  return normalize(s, 0.6);
}

/** 16-bar candy chiptune loop, 120 BPM, A major pentatonic. Deterministic. */
function musicLoop(): Samples {
  const bpm = 120;
  const beat = 60 / bpm;
  const bars = 16;
  const dur = bars * 4 * beat;
  const s = seconds(dur);

  const penta = [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25, 739.99];
  // deterministic melody pattern (indices into penta), one note per half-beat
  const pat = [5, 7, 8, 7, 5, 3, 5, -1, 6, 8, 9, 8, 6, 5, 6, -1];
  const bassPat = [0, 0, 3, 3, 1, 1, 4, 4];

  for (let bar = 0; bar < bars; bar++) {
    const varOff = bar % 4 === 3 ? 1 : 0; // small variation every 4th bar
    for (let i = 0; i < 16; i++) {
      const idx = pat[(i + varOff) % 16]!;
      const t = bar * 4 * beat + i * (beat / 2);
      if (idx >= 0 && (bar + i) % 7 !== 6) {
        const f = penta[(idx + (bar % 2)) % penta.length]! * 2;
        mix(s, tone(f, beat * 0.42, { shape: "triangle", decay: 7, gain: 0.16 }), t);
      }
    }
    for (let i = 0; i < 8; i++) {
      const f = penta[bassPat[i]!]! / 2;
      const t = bar * 4 * beat + i * (beat / 2) * 2 * 0.5;
      mix(s, tone(f, beat * 0.46, { shape: "square", decay: 6, gain: 0.10 }), t);
    }
    // hats on off-beats
    for (let i = 0; i < 8; i++) {
      const t = bar * 4 * beat + (i + 0.5) * (beat / 2) * 2 * 0.5;
      const hat = makeNoise(Math.round(0.03 * SR), 11 + i);
      for (let j = 0; j < hat.length; j++) hat[j]! *= Math.exp(-90 * (j / SR)) * 0.12;
      mix(s, hat, t);
    }
  }
  return normalize(s, 0.5);
}

// ── build ────────────────────────────────────────────────────────────────────

export async function generateAllAudio(): Promise<string[]> {
  await fs.mkdir(paths.audio, { recursive: true });
  const tmp = path.join(paths.audio, "..", "processed", "tmp");
  await fs.mkdir(tmp, { recursive: true });

  const sounds: Record<string, Samples> = {
    "ui-click": sfxClick(),
    "food-pickup": sfxPickup(),
    "food-big": sfxPickupBig(),
    boost: sfxBoost(),
    powerup: sfxPowerup(),
    death: sfxDeath(),
    kill: sfxKill(),
    spawn: sfxSpawn(),
    "rank-up": sfxRankUp(),
    music: musicLoop(),
  };

  const written: string[] = [];
  for (const [name, samples] of Object.entries(sounds)) {
    const wavPath = path.join(tmp, `${name}.wav`);
    const mp3Path = path.join(paths.audio, `${name}.mp3`);
    await fs.writeFile(wavPath, toWav(samples));
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-i", wavPath,
      "-codec:a", "libmp3lame", "-qscale:a", name === "music" ? "5" : "7",
      mp3Path,
    ]);
    await fs.unlink(wavPath);
    written.push(`${name}.mp3`);
  }
  return written;
}
