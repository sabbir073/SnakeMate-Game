/** Generates every SVG master into assets/source/ (spec §37–40, §134).
 *  Deterministic, parametric, data-driven from packages/config — rerunning
 *  always produces identical art. */
import { promises as fs } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import { SKINS } from "@nibblio/config";
import {
  OUTLINE, candyBall, darken, eye, gloss, lighten, rGradient, svgDoc, vGradient,
} from "./svg.js";
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

// ── food (5 kinds, distinct silhouettes) ─────────────────────────────────────

function foodCommon(): string {
  // small round drop — sky blue
  const defs = rGradient("g", "#BDEBFF", "#64D2FF");
  return svgDoc(S, candyBall(S / 2, S / 2, S * 0.3, "g", OW), defs);
}

function foodRare(): string {
  // wrapped candy — mint with wrapper wings
  const c = S / 2;
  const r = S * 0.28;
  const defs = rGradient("g", "#CFF9E9", "#58E6B4");
  const wing = (dir: number): string => {
    const x = c + dir * r;
    return `<path d="M ${x} ${c}
      L ${x + dir * r * 0.85} ${c - r * 0.62}
      Q ${x + dir * r * 1.05} ${c} ${x + dir * r * 0.85} ${c + r * 0.62} Z"
      fill="#2FB98A" stroke="${OUTLINE}" stroke-width="${OW * 0.7}" stroke-linejoin="round"/>`;
  };
  return svgDoc(S, wing(-1) + wing(1) + candyBall(c, c, r, "g", OW), defs);
}

function foodEpic(): string {
  // star candy — pink
  const c = S / 2;
  const R = S * 0.4;
  const r = R * 0.52;
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    d += `${i === 0 ? "M" : "L"} ${c + Math.cos(a) * rad} ${c + Math.sin(a) * rad} `;
  }
  const defs = rGradient("g", "#FFC8F2", "#FF8AF5");
  const body = `<path d="${d}Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}" stroke-linejoin="round"/>
${gloss(c, c - R * 0.2, R * 0.7)}`;
  return svgDoc(S, body, defs);
}

function foodBonus(): string {
  // sprinkle donut — lemon with pink glaze
  const c = S / 2;
  const r = S * 0.38;
  const defs = rGradient("g", "#FFF3B8", "#FFE066");
  const sprinkles = [
    [-0.45, -0.1, 20], [0.1, -0.52, 70], [0.45, -0.18, -30], [-0.15, 0.42, 50], [0.35, 0.35, 10],
  ]
    .map(([dx, dy, rot]) => {
      const x = c + (dx as number) * r * 1.4;
      const y = c + (dy as number) * r * 1.4;
      return `<rect x="${x - 9}" y="${y - 3.5}" width="18" height="7" rx="3.5" fill="#FF6FB5" transform="rotate(${rot} ${x} ${y})"/>`;
    })
    .join("");
  const body = `
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="M ${c - r} ${c} a ${r} ${r} 0 0 1 ${2 * r} 0 a ${r * 0.9} ${r * 0.9} 0 0 1 -${2 * r} 0" fill="#FF9FCB" opacity="0.85"/>
<circle cx="${c}" cy="${c}" r="${r * 0.34}" fill="#12082B" opacity="0.9"/>
<circle cx="${c}" cy="${c}" r="${r * 0.34}" fill="none" stroke="${OUTLINE}" stroke-width="${OW * 0.7}"/>
${sprinkles}
${gloss(c, c - r * 0.3, r * 0.8)}`;
  return svgDoc(S, body, defs);
}

function foodDeathLoot(): string {
  // glowing amber orb with inner core
  const c = S / 2;
  const r = S * 0.3;
  const defs = rGradient("g", "#FFE1B0", "#FFA94D") + rGradient("halo", "#FFC97E", "#FFA94D00");
  const body = `
<circle cx="${c}" cy="${c}" r="${S * 0.48}" fill="url(#halo)" opacity="0.8"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<circle cx="${c}" cy="${c}" r="${r * 0.4}" fill="#FFF3DD" opacity="0.9"/>
${gloss(c, c, r)}`;
  return svgDoc(S, body, defs);
}

// ── powerup badges ────────────────────────────────────────────────────────────

function hexBadge(glyph: string, top: string, bottom: string): string {
  const c = S / 2;
  const r = S * 0.4;
  let d = "";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    d += `${i === 0 ? "M" : "L"} ${c + Math.cos(a) * r} ${c + Math.sin(a) * r} `;
  }
  const defs = vGradient("g", top, bottom);
  const body = `
<path d="${d}Z" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}" stroke-linejoin="round"/>
<path d="${d}Z" fill="none" stroke="#ffffff" stroke-width="${OW * 0.45}" stroke-linejoin="round" opacity="0.35" transform="translate(0 ${-OW * 0.6}) scale(0.92) " transform-origin="${c} ${c}"/>
${glyph}`;
  return svgDoc(S, body, defs);
}

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

// ── glyph paths for powerups (drawn at 256 canvas, centered) ─────────────────

const G = (d: string, extra = ""): string =>
  `<path d="${d}" fill="#ffffff" stroke="${OUTLINE}" stroke-width="6" stroke-linejoin="round"${extra}/>`;

const GLYPHS: Record<string, string> = {
  SPEED: G("M 148 52 L 96 140 L 126 140 L 108 204 L 164 112 L 132 112 Z"),
  MAGNET: G(
    "M 96 72 L 96 140 a 32 32 0 0 0 64 0 L 160 72 L 188 72 L 188 140 a 60 60 0 0 1 -120 0 L 68 72 Z " +
    "M 68 72 L 96 72 L 96 96 L 68 96 Z M 160 72 L 188 72 L 188 96 L 160 96 Z",
  ),
  DOUBLE_GROWTH: G("M 128 58 L 168 106 L 142 106 L 142 138 L 114 138 L 114 106 L 88 106 Z") +
    G("M 128 130 L 168 178 L 142 178 L 142 206 L 114 206 L 114 178 L 88 178 Z"),
  SHIELD: G("M 128 54 L 188 76 L 188 130 Q 188 180 128 206 Q 68 180 68 130 L 68 76 Z"),
  BOOST_REDUCTION: G("M 128 54 Q 168 96 160 138 Q 186 128 184 106 Q 208 160 168 192 Q 148 208 118 204 Q 78 196 72 152 Q 68 118 96 92 Q 92 122 110 130 Q 100 88 128 54 Z"),
  SCORE_MULTIPLIER:
    `<path d="M 84 96 L 128 140 M 128 96 L 84 140" fill="none" stroke="${OUTLINE}" stroke-width="26" stroke-linecap="round"/>` +
    `<path d="M 84 96 L 128 140 M 128 96 L 84 140" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round"/>` +
    G("M 148 88 L 160 116 L 190 118 L 167 137 L 174 166 L 148 150 L 122 166 L 129 137 L 106 118 L 136 116 Z"),
};

const POWERUP_COLORS: Record<string, [string, string]> = {
  SPEED: ["#FFD166", "#FF9F1C"],
  MAGNET: ["#FF8FA3", "#E84393"],
  DOUBLE_GROWTH: ["#7BFFB0", "#2FB98A"],
  SHIELD: ["#8BD3FF", "#3AA4D6"],
  BOOST_REDUCTION: ["#FFB27E", "#FF6B35"],
  SCORE_MULTIPLIER: ["#D3BDFF", "#7C3AED"],
};

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

  await write("food-common.svg", foodCommon());
  await write("food-rare.svg", foodRare());
  await write("food-epic.svg", foodEpic());
  await write("food-bonus.svg", foodBonus());
  await write("food-death_loot.svg", foodDeathLoot());

  for (const [kind, [top, bottom]] of Object.entries(POWERUP_COLORS)) {
    await write(`powerup-${kind.toLowerCase()}.svg`, hexBadge(GLYPHS[kind] ?? "", top, bottom));
  }

  await write("bg-tile.svg", backgroundTile());
  await generateLogo(outDir);
  written.push("logo-wordmark.svg", "logo-icon.svg");

  return written;
}
