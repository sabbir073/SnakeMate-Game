# AUDIO

Runtime side of docs/AUDIO_STYLE.md. Files: `assets/audio/*.mp3` (10 — 9 SFX
+ 1 music loop), preloaded by the arena scene, played through
`src/audio.ts` (AudioManager):

- settings-driven volume buses (music ×0.6, SFX) — live updates from the
  settings modal;
- per-key throttling and pitch variation (spec §45);
- graceful no-op when the audio context is unavailable;
- mobile unlock via Phaser's first-gesture event.

Trigger map: spawn/respawn → spawn; mass gain → food-pickup (≥8 mass →
food-big); new powerup effect → powerup; boost start → boost; local death →
death; respawn button/UI → ui-click. kill/rank-up are wired server-side in M3
event messages.
