/** Generates every SVG master into assets/source/ (spec §37–40, §134).
 *  Deterministic, parametric, data-driven from packages/config — rerunning
 *  always produces identical art. */
import { promises as fs } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import { SKINS } from "@nibblio/config";
import {
  OUTLINE, darken, eye, gloss, lighten, rGradient, svgDoc, vGradient,
} from "./svg.js";
import { CANDY_COLORS, bonbon, candyDrop, donut, lollipop, soulOrb } from "./food-art.js";
import { POWERUP_STYLE, powerupBadge } from "./powerup-art.js";
import { paths } from "./paths.js";

const S = 256; // master size for game sprites
const OW = S * 0.055; // outline width

// ── worm parts ────────────────────────────────────────────────────────────────

function wormHead(base: string, shade: string, accent: string): string {
  const c = S / 2;
  const r = S * 0.42;
  const defs =
    rGradient("g", lighten(base, 0.25), base) +
    vGradient("mouth", darken(shade, 0.2), darken(shade, 0.4));
  // face points RIGHT (angle 0) — matches engine convention
  const eyeR = r * 0.3;
  const ex = c + r * 0.36;
  const ey = r * 0.46;
  const body = `
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="M ${c - r * 0.15} ${c - r} A ${r} ${r} 0 0 1 ${c - r * 0.15} ${c + r}" fill="${accent}" opacity="0.35"/>
${gloss(c, c, r)}
<ellipse cx="${c + r * 0.78}" cy="${c}" rx="${r * 0.14}" ry="${r * 0.19}" fill="url(#mouth)" stroke="${OUTLINE}" stroke-width="${OW * 0.5}"/>
${eye(ex, c - ey, eyeR)}
${eye(ex, c + ey, eyeR)}`;
  return svgDoc(S, body, defs);
}

function wormBody(base: string, shade: string, accent: string): string {
  const c = S / 2;
  const r = S * 0.42;
  const defs = rGradient("g", lighten(base, 0.22), base);
  const body = `
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="M ${c} ${c - r} A ${r} ${r} 0 0 0 ${c} ${c + r} Z" fill="${shade}" opacity="0.25"/>
<circle cx="${c}" cy="${c}" r="${r * 0.45}" fill="${accent}" opacity="0.5"/>
${gloss(c, c, r)}`;
  return svgDoc(S, body, defs);
}

// ── powerup badges ─────


// ── logo (wordmark via font outlines) ────────────────────────────────────────

async function generateLogo(outDir: string): Promise<void> {
  const fontPath = path.join(paths.root, "assets/fonts/baloo2-extrabold.ttf");
  const fontData = await fs.readFile(fontPath);
  const font = opentype.parse(
    fontData.buffer.slice(fontData.byteOffset, fontData.byteOffset + fontData.byteLength),
  );
  const text = "Nibblio";
  const fontSize = 220;
  const p = font.getPath(text, 0, 0, fontSize);
  const bb = p.getBoundingBox();
  const pad = 46;
  const w = Math.ceil(bb.x2 - bb.x1 + pad * 2);
  const h = Math.ceil(bb.y2 - bb.y1 + pad * 2);
  const d = p.toPathData(2);
  const tx = pad - bb.x1;
  const ty = pad - bb.y1;

  const logo = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
${vGradient("wm", "#FFD166", "#FF6FB5")}
</defs>
<g transform="translate(${tx} ${ty})">
<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="30" stroke-linejoin="round"/>
<path d="${d}" fill="url(#wm)"/>
</g>
</svg>`;
  await fs.writeFile(path.join(outDir, "logo-wordmark.svg"), logo);

  // square icon: mascot head on rounded tile (app icon / favicon / social)
  const skin = SKINS[0]!;
  const icon = svgDoc(
    512,
    `
<rect x="8" y="8" width="496" height="496" rx="112" fill="#1D0F42" stroke="#3A2477" stroke-width="14"/>
<g transform="translate(128 128) scale(1)">${wormHead(skin.base, skin.shade, skin.accent)
      .replace(/^[\s\S]*?<defs>/, "")
      .replace("</defs>", "")
      .replace(/<\/svg>\s*$/, "")
      .replace(/<\?xml[\s\S]*?\?>/, "")}</g>
`,
  );
  // NOTE: nested-svg trick above is brittle — build icon cleanly instead:
  const c = 256;
  const r = 158;
  const iconClean = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs>${rGradient("g", lighten(skin.base, 0.25), skin.base)}</defs>
<rect x="8" y="8" width="496" height="496" rx="112" fill="#1D0F42" stroke="#3A2477" stroke-width="14"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="18"/>
${gloss(c, c, r)}
<ellipse cx="${c + r * 0.78}" cy="${c}" rx="${r * 0.14}" ry="${r * 0.19}" fill="${darken(skin.shade, 0.3)}" stroke="${OUTLINE}" stroke-width="9"/>
${eye(c + r * 0.36, c - r * 0.46, r * 0.3)}
${eye(c + r * 0.36, c + r * 0.46, r * 0.3)}
</svg>`;
  void icon;
  await fs.writeFile(path.join(outDir, "logo-icon.svg"), iconClean);
}

// ── background tile ──────────────────────────────────────────────────────────

function backgroundTile(): string {
  const size = 512;
  // deterministic scatter of soft dots/bubbles on transparent (engine tints bg)
  const seeds = [
    [60, 90, 26], [210, 40, 14], [420, 120, 32], [330, 240, 12], [90, 300, 20],
    [480, 380, 16], [250, 430, 28], [140, 480, 12], [380, 470, 10], [30, 200, 10],
    [470, 250, 8], [180, 180, 8], [300, 330, 9], [430, 30, 10], [20, 420, 22],
  ];
  const dots = seeds
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#8B6BD9" opacity="0.05"/>`)
    .join("\n");
  const sparkles = [
    [120, 60], [400, 200], [80, 380], [300, 100], [200, 300], [460, 440],
  ]
    .map(([x, y]) =>
      `<path d="M ${x} ${y! - 7} L ${x! + 2} ${y! - 2} L ${x! + 7} ${y} L ${x! + 2} ${y! + 2} L ${x} ${y! + 7} L ${x! - 2} ${y! + 2} L ${x! - 7} ${y} L ${x! - 2} ${y! - 2} Z" fill="#B9A7E6" opacity="0.08"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="#160B33"/>
${dots}
${sparkles}
</svg>`;
}


// ── main ─────────────────────────────────────────────────────────────────────

export async function generateAllArt(): Promise<string[]> {
  const outDir = path.join(paths.root, "assets/source");
  await fs.mkdir(outDir, { recursive: true });
  const written: string[] = [];
  const write = async (name: string, content: string): Promise<void> => {
    await fs.writeFile(path.join(outDir, name), content);
    written.push(name);
  };

  for (const skin of SKINS) {
    await write(`worm-head-${skin.id}.svg`, wormHead(skin.base, skin.shade, skin.accent));
    await write(`worm-body-${skin.id}.svg`, wormBody(skin.base, skin.shade, skin.accent));
  }

  // wormate-style candy foods with per-kind variety
  for (let i = 0; i < CANDY_COLORS.length; i++) {
    await write(`food-common-${i}.svg`, candyDrop(i));
  }
  for (let i = 0; i < 3; i++) await write(`food-rare-${i}.svg`, bonbon(i));
  for (let i = 0; i < 2; i++) await write(`food-epic-${i}.svg`, lollipop(i));
  for (let i = 0; i < 2; i++) await write(`food-bonus-${i}.svg`, donut(i));
  await write("food-death_loot.svg", soulOrb());

  for (const kind of Object.keys(POWERUP_STYLE)) {
    await write(`powerup-${kind.toLowerCase()}.svg`, powerupBadge(kind));
  }

  await write("bg-tile.svg", backgroundTile());
  await generateLogo(outDir);
  written.push("logo-wordmark.svg", "logo-icon.svg");

  return written;
}
