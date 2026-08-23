/** Minimal deterministic shelf atlas packer (spec §41).
 *  Packs same-ish-sized PNG frames into one texture + Phaser 3 atlas JSON. */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

export interface AtlasFrameIn {
  name: string;
  png: Buffer;
  width: number;
  height: number;
}

export interface AtlasOut {
  png: Buffer;
  json: object;
  width: number;
  height: number;
}

export async function packAtlas(frames: AtlasFrameIn[], maxWidth = 2048, padding = 2): Promise<AtlasOut> {
  // sort tallest-first for decent shelf packing, name-tiebreak for determinism
  const sorted = [...frames].sort(
    (a, b) => b.height - a.height || a.name.localeCompare(b.name),
  );

  interface Placed extends AtlasFrameIn { x: number; y: number }
  const placed: Placed[] = [];
  let shelfY = 0;
  let shelfH = 0;
  let cursorX = 0;
  let usedW = 0;

  for (const f of sorted) {
    if (cursorX + f.width + padding > maxWidth) {
      shelfY += shelfH + padding;
      shelfH = 0;
      cursorX = 0;
    }
    placed.push({ ...f, x: cursorX, y: shelfY });
    cursorX += f.width + padding;
    shelfH = Math.max(shelfH, f.height);
    usedW = Math.max(usedW, cursorX);
  }
  const width = Math.min(maxWidth, usedW);
  const height = shelfY + shelfH;

  const composite = placed.map((p) => ({ input: p.png, left: p.x, top: p.y }));
  const png = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composite)
    .png({ compressionLevel: 9 })
    .toBuffer();

  const json = {
    frames: Object.fromEntries(
      placed.map((p) => [
        p.name,
        {
          frame: { x: p.x, y: p.y, w: p.width, h: p.height },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: p.width, h: p.height },
          sourceSize: { w: p.width, h: p.height },
        },
      ]),
    ),
    meta: {
      app: "nibblio-asset-pipeline",
      version: "1",
      image: "game-atlas.png",
      size: { w: width, h: height },
      scale: "1",
    },
  };

  return { png, json, width, height };
}

export async function renderSvgToPng(svgPath: string, size: number): Promise<Buffer> {
  return sharp(svgPath, { density: 300 }).resize(size, size, { fit: "inside" }).png().toBuffer();
}

export async function writeFileEnsuring(filePath: string, data: Buffer | string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}
