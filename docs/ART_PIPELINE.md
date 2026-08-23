# ART PIPELINE

`pnpm asset:build` runs `tools/asset-pipeline/src/build.ts`:

1. **generate-art.ts** — writes every SVG master to `assets/source/`
   (worm heads/bodies ×6 skins, 5 foods, 6 powerup badges, bg tile, wordmark +
   icon). Parametric + deterministic; palette comes from
   `packages/config/src/skins.ts` and docs/ART_STYLE.md.
   Wordmark: Baloo 2 ExtraBold (OFL) converted to outlines via opentype.js
   (pinned 1.3.4 — 2.x emits NaN path tokens).
2. **generate-audio.ts** — synthesizes all SFX + music (see AUDIO_STYLE.md),
   encodes MP3 via ffmpeg into `assets/audio/`.
3. **Render** — sharp rasterizes masters at runtime sizes (worm 128, food 64,
   powerup 96; logo 800w, icon 512/192, favicon 64, social 1200×630).
4. **atlas.ts** — deterministic shelf packer → `assets/atlases/game-atlas.png`
   + Phaser-format JSON.
5. **Copy + manifest** — everything lands in `apps/client/public/assets/`,
   described by `assets-manifest.json` (id, type, path, dims, content-hash
   version, preload group, provenance metadata).
6. **Validation (spec §97)** — unsupported formats, empty files, duplicates,
   oversized textures fail the build (part of `pnpm gate`).

Source masters and processed output are committed, so the repo is playable
without running the pipeline; rerunning reproduces identical art.

Fonts: `assets/fonts/` (Baloo 2, SIL OFL 1.1 — see LICENSE.md there).
