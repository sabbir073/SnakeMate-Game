/** Nibblio asset pipeline (spec §38, §41, §83, §97).
 *
 *  generate SVG masters → render PNGs at runtime sizes → pack game atlas →
 *  standalone images (logo, icon, favicon, background, social) → copy fonts
 *  and audio → write assets-manifest.json → validate.
 *
 *  Deterministic: rerunning on the same inputs yields identical output
 *  (timestamps in the manifest aside).
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { AssetEntry, AssetManifest } from "@nibblio/asset-types";
import { generateAllArt } from "./generate-art.js";
import { generateAllAudio } from "./generate-audio.js";
import { packAtlas, writeFileEnsuring } from "./atlas.js";
import type { AtlasFrameIn } from "./atlas.js";
import { paths } from "./paths.js";

const ATLAS_SIZES: Record<string, number> = {
  "worm-head": 160,
  "worm-ring": 128,
  food: 96,
  powerup: 96,
  "fx-glow": 128,
};

function frameSize(name: string): number {
  for (const [prefix, size] of Object.entries(ATLAS_SIZES)) {
    if (name.startsWith(prefix)) return size;
  }
  return 96;
}

async function renderSquare(svgFile: string, size: number): Promise<Buffer> {
  return sharp(svgFile, { density: 288 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const problems: string[] = [];
  const entries: AssetEntry[] = [];
  const generated = new Date().toISOString();

  const addEntry = (e: Omit<AssetEntry, "version"> & { data: Buffer }): void => {
    // hash the bytes for the version, but NEVER embed them — the client
    // downloads this manifest on every visit
    const { data, ...meta } = e;
    entries.push({
      ...meta,
      version: createHash("sha256").update(data).digest("hex").slice(0, 10),
    } as AssetEntry);
  };

  // 1. regenerate SVG masters + audio
  const masters = await generateAllArt();
  console.log(`[assets] ${masters.length} SVG masters generated`);
  const audioFiles = await generateAllAudio();
  console.log(`[assets] ${audioFiles.length} audio files synthesized`);

  // 2. atlas frames (worm parts, food, powerups)
  const frames: AtlasFrameIn[] = [];
  for (const name of masters) {
    if (!/^(worm-|food-|powerup-|fx-)/.test(name)) continue;
    const size = frameSize(name);
    const png = await renderSquare(path.join(paths.source, name), size);
    frames.push({ name: name.replace(/\.svg$/, ""), png, width: size, height: size });
  }
  const atlas = await packAtlas(frames);
  await writeFileEnsuring(path.join(paths.atlases, "game-atlas.png"), atlas.png);
  await writeFileEnsuring(
    path.join(paths.atlases, "game-atlas.json"),
    JSON.stringify(atlas.json, null, 2),
  );
  await writeFileEnsuring(path.join(paths.clientAssets, "game-atlas.png"), atlas.png);
  await writeFileEnsuring(
    path.join(paths.clientAssets, "game-atlas.json"),
    JSON.stringify(atlas.json),
  );
  addEntry({
    id: "atlas.game", type: "atlas", path: "assets/game-atlas.png",
    dataPath: "assets/game-atlas.json", width: atlas.width, height: atlas.height,
    preload: "core", data: atlas.png,
    meta: { source: "assets/source (procedural SVG)", generated, purpose: "gameplay sprites" },
  });
  console.log(`[assets] atlas packed: ${frames.length} frames, ${atlas.width}x${atlas.height}`);

  // 3. standalone images
  const standalone: Array<{ id: string; src: string; out: string; width: number; preload: AssetEntry["preload"] }> = [
    { id: "img.logo", src: "logo-wordmark.svg", out: "logo.png", width: 800, preload: "core" },
    { id: "img.icon512", src: "logo-icon.svg", out: "icon-512.png", width: 512, preload: "cosmetic" },
    { id: "img.icon192", src: "logo-icon.svg", out: "icon-192.png", width: 192, preload: "cosmetic" },
    { id: "img.bgtile", src: "bg-tile.svg", out: "bg-tile.png", width: 512, preload: "core" },
  ];
  for (const s of standalone) {
    const buf = await sharp(path.join(paths.source, s.src), { density: 288 })
      .resize({ width: s.width })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const meta = await sharp(buf).metadata();
    await writeFileEnsuring(path.join(paths.processed, s.out), buf);
    await writeFileEnsuring(path.join(paths.clientAssets, s.out), buf);
    addEntry({
      id: s.id, type: "image", path: `assets/${s.out}`,
      width: meta.width, height: meta.height, preload: s.preload, data: buf,
      meta: { source: `assets/source/${s.src}`, generated, purpose: s.id },
    });
  }
  // favicon (32px png — modern browsers accept png favicons)
  const favicon = await renderSquare(path.join(paths.source, "logo-icon.svg"), 64);
  await writeFileEnsuring(path.join(paths.clientPublic, "favicon.png"), favicon);
  // social preview 1200x630
  const social = await sharp({
    create: { width: 1200, height: 630, channels: 4, background: "#12082b" },
  })
    .composite([
      {
        input: await sharp(path.join(paths.source, "logo-wordmark.svg"), { density: 288 })
          .resize({ width: 900 })
          .png()
          .toBuffer(),
        gravity: "center",
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFileEnsuring(path.join(paths.processed, "social-preview.png"), social);
  await writeFileEnsuring(path.join(paths.clientPublic, "social-preview.png"), social);

  // 4. fonts → client public
  try {
    for (const f of await fs.readdir(paths.fonts)) {
      if (!/\.(ttf|woff2?)$/.test(f)) continue;
      const buf = await fs.readFile(path.join(paths.fonts, f));
      await writeFileEnsuring(path.join(paths.clientAssets, "fonts", f), buf);
      addEntry({
        id: `font.${f.replace(/\.[^.]+$/, "")}`, type: "font",
        path: `assets/fonts/${f}`, preload: "core", data: buf,
        meta: { license: "OFL-1.1 (see assets/fonts/LICENSE.md)", purpose: "UI font" },
      });
    }
  } catch { /* no fonts dir */ }

  // 5. audio → client public (generated by tools/audio; optional until M2 audio pass)
  try {
    for (const f of await fs.readdir(paths.audio)) {
      if (!/\.(mp3|ogg|wav|m4a)$/.test(f)) continue;
      const buf = await fs.readFile(path.join(paths.audio, f));
      if (buf.length === 0) {
        problems.push(`empty audio: ${f}`);
        continue;
      }
      await writeFileEnsuring(path.join(paths.clientAssets, "audio", f), buf);
      addEntry({
        id: `audio.${f.replace(/\.[^.]+$/, "")}`, type: "audio",
        path: `assets/audio/${f}`, preload: "gameplay", data: buf,
        meta: { source: "tools/audio (procedural synthesis)", generated, purpose: "sfx/music" },
      });
    }
  } catch { /* no audio yet */ }

  // 6. validation (spec §97)
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.id)) problems.push(`duplicate asset id: ${e.id}`);
    seen.add(e.id);
    if ((e.width ?? 0) > 4096 || (e.height ?? 0) > 4096) problems.push(`oversized: ${e.id}`);
  }
  if (problems.length > 0) {
    console.error("[assets] validation problems:");
    for (const p of problems) console.error("  -", p);
    process.exitCode = 1;
    return;
  }

  // 7. manifest
  const manifest: AssetManifest = {
    generatedAt: generated,
    pipelineVersion: 2,
    entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
  };
  await writeFileEnsuring(
    path.join(paths.clientPublic, "assets-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(
    `[assets] done: ${entries.length} entries in ${Date.now() - t0}ms → apps/client/public/`,
  );
}

void main();
