# AUDIO STYLE

**Tone:** cheerful candy arcade — round, soft, never harsh. Everything is
synthesized procedurally in `tools/asset-pipeline/src/generate-audio.ts`
(sine/triangle/square + shaped noise), so the set is 100% original and
regenerable. Delivery: MP3 (libmp3lame), SFX ≤ 9 KB, music loop ~360 KB.

## Feedback priorities (loud → subtle)

1. death (low saw drop + thump) — must always cut through
2. kill + rank-up (square/triangle fanfares)
3. powerup (rising 4-note arpeggio C-E-G-C)
4. big food (major-third pluck) / boost (noise swell + saw rise)
5. common food pickup (short 640→340 Hz blip, ±120 cents variation)
6. UI click (tiny triangle blip)

## Music

16-bar A-major-pentatonic chiptune loop, 120 BPM: triangle lead, square bass,
noise hats on off-beats. Mixed at −6 dB under SFX (0.6 × music volume bus).

## Rules

- AudioManager only (spec §45): per-key throttles (food 70 ms, boost 350 ms,
  click 60 ms); pickup streaks vary pitch instead of stacking volume.
- Volume buses: master implied by the two sliders (music, SFX); mute = 0.
- Mobile: playback begins on first user gesture (Phaser unlock event).
- Never autoplay before the player pressed PLAY.
