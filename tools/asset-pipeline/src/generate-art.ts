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
import {
  DROP_COLORS, bonbon, cakeSlice, candyDrop, cookie, donut, fxGlow,
  gummyBear, jellyBean, lollipop, macaron, soulOrb,
} from "./food-art2.js";
import { POWERUP_STYLE, powerupBadge } from "./powerup-art.js";
import { paths } from "./paths.js";

const S = 256; // master size for game sprites
const OW = S * 0.055; // outline width

// ── worm parts ────────────────────────────────────────────────────────────────

function wormHead(base: string, shade: string, accent: string): string {
  const c = S / 2;
  const r = S * 0.42;
  const defs =
    rGradient("g", lighten(base, 0.3), base) +
    vGradient("mouthG", "#7A1F35", "#4A0F1E");
  // face points RIGHT (angle 0) — big forward googly eyes, brows, open smile
  const eyeR = r * 0.38;
  const ex = c + r * 0.3;
  const ey = r * 0.44;
  const premiumEye = (cy: number): string => `
<circle cx="${ex}" cy="${cy}" r="${eyeR}" fill="#ffffff" stroke="${OUTLINE}" stroke-width="${eyeR * 0.13}"/>
<circle cx="${ex + eyeR * 0.34}" cy="${cy + eyeR * 0.02}" r="${eyeR * 0.46}" fill="#1B0F2E"/>
<circle cx="${ex + eyeR * 0.52}" cy="${cy - eyeR * 0.18}" r="${eyeR * 0.15}" fill="#ffffff"/>
<circle cx="${ex + eyeR * 0.2}" cy="${cy + eyeR * 0.24}" r="${eyeR * 0.07}" fill="#ffffff" opacity="0.8"/>
<path d="M ${ex - eyeR * 0.75} ${cy - eyeR * 1.06} Q ${ex} ${cy - eyeR * 1.4} ${ex + eyeR * 0.8} ${cy - eyeR * 1.02}"
  fill="none" stroke="${OUTLINE}" stroke-width="${eyeR * 0.14}" stroke-linecap="round"/>`;
  const mx = c + r * 0.72;
  const body = `
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="M ${c - r * 0.2} ${c - r} A ${r} ${r} 0 0 1 ${c - r * 0.2} ${c + r}" fill="${accent}" opacity="0.3"/>
<path d="M ${c - r} ${c} A ${r} ${r} 0 0 0 ${c + r * 0.5} ${c + r * 0.86}" fill="none"
  stroke="${shade}" stroke-width="${OW * 1.4}" opacity="0.35"/>
${gloss(c - r * 0.1, c - r * 0.12, r)}
<path d="M ${mx} ${c - r * 0.3} Q ${mx + r * 0.42} ${c} ${mx} ${c + r * 0.3} Q ${mx - r * 0.3} ${c} ${mx} ${c - r * 0.3} Z"
  fill="url(#mouthG)" stroke="${OUTLINE}" stroke-width="${OW * 0.6}" stroke-linejoin="round"/>
<ellipse cx="${mx + r * 0.04}" cy="${c + r * 0.14}" rx="${r * 0.13}" ry="${r * 0.08}" fill="#FF6F8E"/>
${premiumEye(c - ey)}
${premiumEye(c + ey)}`;
  return svgDoc(S, body, defs);
}

/** Grayscale glossy orb — tinted per-ring at runtime for patterned bodies. */
function wormRing(): string {
  const c = S / 2;
  const r = S * 0.42;
  const defs = rGradient("g", "#FFFFFF", "#B9B9C4");
  const body = `
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="#26262E" stroke-width="${OW}"/>
<path d="M ${c - r} ${c} A ${r} ${r} 0 0 0 ${c + r} ${c} A ${r * 0.99} ${r * 0.99} 0 0 1 ${c - r} ${c} Z"
  fill="#8E8E9C" opacity="0.45"/>
${gloss(c - r * 0.05, c - r * 0.1, r)}`;
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
  }
  await write("worm-ring.svg", wormRing());
  await write("fx-glow.svg", fxGlow());

  // premium dessert food set v2 (2.5D extrusion + baked glow)
  for (let i = 0; i < DROP_COLORS.length; i++) {
    await write(`food-common-${i}.svg`, candyDrop(i));
  }
  await write("food-common-6.svg", cookie());
  await write("food-common-7.svg", jellyBean());
  for (let i = 0; i < 3; i++) await write(`food-rare-${i}.svg`, macaron(i));
  await write("food-rare-3.svg", bonbon());
  for (let i = 0; i < 2; i++) await write(`food-epic-${i}.svg`, gummyBear(i));
  for (let i = 0; i < 2; i++) await write(`food-epic-${i + 2}.svg`, lollipop(i));
  for (let i = 0; i < 2; i++) await write(`food-bonus-${i}.svg`, donut(i));
  for (let i = 0; i < 2; i++) await write(`food-bonus-${i + 2}.svg`, cakeSlice(i));
  await write("food-death_loot.svg", soulOrb());

  for (const kind of Object.keys(POWERUP_STYLE)) {
    await write(`powerup-${kind.toLowerCase()}.svg`, powerupBadge(kind));
  }

  await write("bg-tile.svg", backgroundTile());
  await generateLogo(outDir);
  written.push("logo-wordmark.svg", "logo-icon.svg");

  return written;
}
