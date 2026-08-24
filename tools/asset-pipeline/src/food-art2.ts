/** Premium dessert food set v2 (original art, genre-quality bar).
 *  Shared recipe for the "premium" look:
 *   1. soft radial halo behind (baked glow)
 *   2. darker extruded SIDE copy offset downward (2.5D depth)
 *   3. main face with saturated two-tone gradient + fat dark outline
 *   4. big glossy top-left shine + tiny sparkle
 */
import { OUTLINE, lighten, darken, rGradient, svgDoc, vGradient } from "./svg.js";

const S = 256;
const OW = S * 0.045;
const EX = S * 0.055; // extrusion depth

function halo(color: string, r = 0.49, opacity = 0.5): string {
  return `<circle cx="${S / 2}" cy="${S / 2}" r="${S * r}" fill="url(#halo)" opacity="${opacity}"/>`;
}

function haloDef(color: string): string {
  // librsvg ignores 8-digit-hex alpha in gradient stops — use stop-opacity
  return `<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="${color}" stop-opacity="0.55"/>
<stop offset="0.6" stop-color="${color}" stop-opacity="0.28"/>
<stop offset="1" stop-color="${color}" stop-opacity="0"/>
</radialGradient>`;
}

function shine(cx: number, cy: number, rx: number, ry: number, rot = -24, op = 0.85): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#ffffff" opacity="${op}"
    transform="rotate(${rot} ${cx} ${cy})"/>`;
}

function sparkle(cx: number, cy: number, r: number, op = 0.95): string {
  return `<path d="M ${cx} ${cy - r} Q ${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy}
    Q ${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r}
    Q ${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy}
    Q ${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r} Z" fill="#ffffff" opacity="${op}"/>`;
}

// ── COMMON: candy drops (6) + cookie + jelly bean ───────────────────────────

export const DROP_COLORS: string[] = [
  "#FF5D73", "#FFB545", "#FFE066", "#5CE685", "#64D2FF", "#C58AFF",
];

export function candyDrop(variant: number): string {
  const base = DROP_COLORS[variant % DROP_COLORS.length]!;
  const c = S / 2;
  const r = S * 0.3;
  const defs = haloDef(base) + rGradient("g", lighten(base, 0.4), base);
  return svgDoc(S, `
${halo(base)}
<circle cx="${c}" cy="${c + EX}" r="${r}" fill="${darken(base, 0.35)}" stroke="${OUTLINE}" stroke-width="${OW}"/>
<circle cx="${c}" cy="${c - EX * 0.4}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
${shine(c - r * 0.34, c - EX * 0.4 - r * 0.4, r * 0.36, r * 0.22)}
${sparkle(c + r * 0.5, c - r * 0.55, r * 0.16)}`, defs);
}

export function cookie(): string {
  const c = S / 2;
  const r = S * 0.32;
  const base = "#E8A85C";
  const defs = haloDef("#FFD166") + rGradient("g", "#F5C98A", base);
  const chips = [[-0.35, -0.3], [0.25, -0.42], [0.42, 0.15], [-0.1, 0.28], [-0.45, 0.25], [0.05, -0.05]]
    .map(([dx, dy]) => `<circle cx="${c + dx! * r}" cy="${c - EX * 0.4 + dy! * r}" r="${r * 0.13}"
      fill="#5B3A1E" stroke="${OUTLINE}" stroke-width="2.5"/>`)
    .join("");
  return svgDoc(S, `
${halo("#FFD166")}
<circle cx="${c}" cy="${c + EX}" r="${r}" fill="#A66A2E" stroke="${OUTLINE}" stroke-width="${OW}"/>
<circle cx="${c}" cy="${c - EX * 0.4}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
${chips}
${shine(c - r * 0.4, c - EX * 0.4 - r * 0.42, r * 0.3, r * 0.16, -24, 0.5)}`, defs);
}

export function jellyBean(): string {
  const c = S / 2;
  const base = "#FF8FA3";
  const defs = haloDef(base) + rGradient("g", lighten(base, 0.35), base);
  const bean = (dy: number, fill: string): string =>
    `<path d="M ${c - S * 0.3} ${c + dy}
      a ${S * 0.155} ${S * 0.17} 0 1 1 ${S * 0.3} ${-S * 0.1}
      a ${S * 0.155} ${S * 0.17} 0 1 1 ${S * 0.3} ${S * 0.1}
      a ${S * 0.31} ${S * 0.30} 0 0 1 -${S * 0.6} 0 Z"
      fill="${fill}" stroke="${OUTLINE}" stroke-width="${OW}"/>`;
  return svgDoc(S, `
${halo(base)}
${bean(EX, darken(base, 0.35))}
${bean(-EX * 0.4, "url(#g)")}
${shine(c - S * 0.14, c - EX * 0.4 - S * 0.1, S * 0.09, S * 0.05)}
${sparkle(c + S * 0.16, c - S * 0.14, S * 0.045)}`, defs);
}

// ── RARE: macarons (3) + bonbon ─────────────────────────────────────────────

const MACARON_COLORS: string[] = ["#FF6FB5", "#58E6B4", "#C58AFF"];

export function macaron(variant: number): string {
  const base = MACARON_COLORS[variant % MACARON_COLORS.length]!;
  const c = S / 2;
  const rx = S * 0.34;
  const ry = S * 0.135;
  const defs = haloDef(base) + vGradient("g", lighten(base, 0.32), base);
  const shell = (cy: number, fill: string): string => `
<ellipse cx="${c}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${OUTLINE}" stroke-width="${OW}"/>`;
  const frill = (cy: number): string => {
    let d = "";
    for (let i = 0; i < 9; i++) {
      const x0 = c - rx * 0.86 + (i / 9) * rx * 1.72;
      const x1 = c - rx * 0.86 + ((i + 1) / 9) * rx * 1.72;
      d += `M ${x0} ${cy} Q ${(x0 + x1) / 2} ${cy + ry * 0.9} ${x1} ${cy} `;
    }
    return `<path d="${d}" fill="none" stroke="${darken(base, 0.25)}" stroke-width="4" opacity="0.8"/>`;
  };
  return svgDoc(S, `
${halo(base)}
${shell(c + ry * 1.7, darken(base, 0.3))}
<rect x="${c - rx * 0.92}" y="${c - ry * 0.25}" width="${rx * 1.84}" height="${ry * 1.9}"
  rx="${ry * 0.8}" fill="#FFF3DD" stroke="${OUTLINE}" stroke-width="${OW * 0.8}"/>
${shell(c - ry * 1.15, "url(#g)")}
${frill(c - ry * 0.35)}
${shine(c - rx * 0.4, c - ry * 1.9, rx * 0.3, ry * 0.45)}
${sparkle(c + rx * 0.55, c - ry * 2.2, S * 0.04)}`, defs);
}

export function bonbon(): string {
  const base = "#FFA94D";
  const c = S / 2;
  const r = S * 0.24;
  const defs = haloDef(base) + rGradient("g", lighten(base, 0.32), base);
  const wing = (dir: number): string => `
<path d="M ${c + dir * (r - 4)} ${c - r * 0.32}
  Q ${c + dir * r * 1.6} ${c - r * 0.85} ${c + dir * r * 2.1} ${c - r * 0.6}
  Q ${c + dir * r * 1.85} ${c} ${c + dir * r * 2.1} ${c + r * 0.6}
  Q ${c + dir * r * 1.6} ${c + r * 0.85} ${c + dir * (r - 4)} ${c + r * 0.32} Z"
  fill="${base}" stroke="${OUTLINE}" stroke-width="${OW * 0.8}" stroke-linejoin="round"/>`;
  return svgDoc(S, `
${halo(base)}
<g transform="translate(0 ${EX})" opacity="0.45">${wing(-1)}${wing(1)}
<circle cx="${c}" cy="${c}" r="${r}" fill="${darken(base, 0.45)}"/></g>
${wing(-1)}${wing(1)}
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="M ${c - r * 0.7} ${c - r * 0.4} Q ${c} ${c - r * 0.75} ${c + r * 0.7} ${c - r * 0.4}"
  fill="none" stroke="#FFF3DD" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
<path d="M ${c - r * 0.7} ${c + r * 0.4} Q ${c} ${c + r * 0.05} ${c + r * 0.7} ${c + r * 0.4}"
  fill="none" stroke="${darken(base, 0.3)}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
${shine(c - r * 0.3, c - r * 0.45, r * 0.3, r * 0.18)}`, defs);
}

// ── EPIC: gummy bears (2) + lollipops (2) ───────────────────────────────────

const GUMMY_COLORS: string[] = ["#FF5D73", "#5CE685"];

export function gummyBear(variant: number): string {
  const base = GUMMY_COLORS[variant % GUMMY_COLORS.length]!;
  const c = S / 2;
  const u = S * 0.052; // unit
  const defs = haloDef(base) + rGradient("g", lighten(base, 0.42), base);
  const bear = (fill: string, stroke: boolean): string => `
    <g ${stroke ? "" : ""}>
    <circle cx="${c}" cy="${c - 3.4 * u}" r="${2.4 * u}" fill="${fill}" ${stroke ? `stroke="${OUTLINE}" stroke-width="${OW}"` : ""}/>
    <circle cx="${c - 2 * u}" cy="${c - 5 * u}" r="${1.05 * u}" fill="${fill}" ${stroke ? `stroke="${OUTLINE}" stroke-width="${OW * 0.8}"` : ""}/>
    <circle cx="${c + 2 * u}" cy="${c - 5 * u}" r="${1.05 * u}" fill="${fill}" ${stroke ? `stroke="${OUTLINE}" stroke-width="${OW * 0.8}"` : ""}/>
    <ellipse cx="${c}" cy="${c + 1.6 * u}" rx="${2.9 * u}" ry="${3.3 * u}" fill="${fill}" ${stroke ? `stroke="${OUTLINE}" stroke-width="${OW}"` : ""}/>
    <ellipse cx="${c - 2.6 * u}" cy="${c - 0.4 * u}" rx="${1.1 * u}" ry="${1.7 * u}" fill="${fill}" ${stroke ? `stroke="${OUTLINE}" stroke-width="${OW * 0.8}"` : ""} transform="rotate(20 ${c - 2.6 * u} ${c - 0.4 * u})"/>
    <ellipse cx="${c + 2.6 * u}" cy="${c - 0.4 * u}" rx="${1.1 * u}" ry="${1.7 * u}" fill="${fill}" ${stroke ? `stroke="${OUTLINE}" stroke-width="${OW * 0.8}"` : ""} transform="rotate(-20 ${c + 2.6 * u} ${c - 0.4 * u})"/>
    <ellipse cx="${c - 1.6 * u}" cy="${c + 4.3 * u}" rx="${1.2 * u}" ry="${1.5 * u}" fill="${fill}" ${stroke ? `stroke="${OUTLINE}" stroke-width="${OW * 0.8}"` : ""}/>
    <ellipse cx="${c + 1.6 * u}" cy="${c + 4.3 * u}" rx="${1.2 * u}" ry="${1.5 * u}" fill="${fill}" ${stroke ? `stroke="${OUTLINE}" stroke-width="${OW * 0.8}"` : ""}/>
    </g>`;
  return svgDoc(S, `
${halo(base)}
<g transform="translate(0 ${EX})" opacity="0.5">${bear(darken(base, 0.4), false)}</g>
${bear("url(#g)", true)}
<circle cx="${c - 0.8 * u}" cy="${c - 3.6 * u}" r="${0.34 * u}" fill="${OUTLINE}"/>
<circle cx="${c + 0.8 * u}" cy="${c - 3.6 * u}" r="${0.34 * u}" fill="${OUTLINE}"/>
<path d="M ${c - 0.5 * u} ${c - 2.6 * u} Q ${c} ${c - 2.1 * u} ${c + 0.5 * u} ${c - 2.6 * u}"
  fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>
${shine(c - 1.4 * u, c - 4.4 * u, 1.1 * u, 0.6 * u)}
<ellipse cx="${c - 1.4 * u}" cy="${c + 0.6 * u}" rx="${1.0 * u}" ry="${1.8 * u}" fill="#ffffff" opacity="0.35"
  transform="rotate(14 ${c - 1.4 * u} ${c + 0.6 * u})"/>`, defs);
}

const LOLLI_COLORS: string[] = ["#FF6FB5", "#64D2FF"];

export function lollipop(variant: number): string {
  const base = LOLLI_COLORS[variant % LOLLI_COLORS.length]!;
  const c = S / 2;
  const cy = c - S * 0.07;
  const r = S * 0.27;
  const defs = haloDef(base) + rGradient("g", lighten(base, 0.2), base);
  let d = `M ${c} ${cy}`;
  const turns = 2.6;
  for (let i = 1; i <= 90; i++) {
    const t = (i / 90) * turns * Math.PI * 2;
    const rad = (i / 90) * r * 0.8;
    d += ` L ${c + Math.cos(t) * rad} ${cy + Math.sin(t) * rad}`;
  }
  return svgDoc(S, `
${halo(base)}
<rect x="${c - 7}" y="${cy + r * 0.6}" width="14" height="${S * 0.33}" rx="7"
  fill="#FFF3DD" stroke="${OUTLINE}" stroke-width="5"/>
<circle cx="${c + 4}" cy="${cy + 4}" r="${r}" fill="${darken(base, 0.4)}"/>
<circle cx="${c}" cy="${cy}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${r * 0.2}" stroke-linecap="round" opacity="0.95"/>
<circle cx="${c}" cy="${cy}" r="${r}" fill="none" stroke="${OUTLINE}" stroke-width="${OW}"/>
${shine(c - r * 0.38, cy - r * 0.44, r * 0.3, r * 0.16, -26, 0.75)}
${sparkle(c + r * 0.6, cy - r * 0.6, r * 0.16)}`, defs);
}

// ── BONUS: donuts (2) + cake slices (2) ─────────────────────────────────────

const GLAZES: Array<[string, string]> = [["#FF9FCB", "#E8749F"], ["#8B5A2E", "#6B4420"]];

export function donut(variant: number): string {
  const [glaze, glazeDeep] = GLAZES[variant % GLAZES.length]!;
  const c = S / 2;
  const r = S * 0.32;
  const hole = r * 0.34;
  const defs = haloDef(glaze) + rGradient("g", "#FFEBB8", "#F2CB6C");
  const sprinkleColors = ["#FF5D73", "#5CE685", "#64D2FF", "#FFE066", "#C58AFF", "#ffffff"];
  const sprinkles = [
    [-0.52, -0.36, 25], [0.05, -0.62, 75], [0.52, -0.32, -20], [-0.64, 0.16, 60],
    [0.64, 0.2, 15], [-0.28, 0.56, -45], [0.32, 0.54, 30], [0.0, 0.66, 80],
  ]
    .map(([dx, dy, rot], i) => {
      const x = c + (dx as number) * r;
      const y = c - EX * 0.4 + (dy as number) * r;
      return `<rect x="${x - 9}" y="${y - 3.5}" width="18" height="7" rx="3.5"
        fill="${sprinkleColors[i % sprinkleColors.length]}" stroke="${OUTLINE}" stroke-width="2"
        transform="rotate(${rot} ${x} ${y})"/>`;
    })
    .join("");
  let glazePath = "";
  const waves = 9;
  for (let i = 0; i <= waves; i++) {
    const a1 = ((i + 0.5) / waves) * Math.PI * 2;
    const rr = r * 0.98;
    const rDip = r * 0.76;
    const x0 = c + Math.cos((i / waves) * Math.PI * 2) * rr;
    const y0 = c - EX * 0.4 + Math.sin((i / waves) * Math.PI * 2) * rr;
    glazePath += i === 0 ? `M ${x0} ${y0}` : "";
    glazePath += ` Q ${c + Math.cos(a1) * rDip} ${c - EX * 0.4 + Math.sin(a1) * rDip}
      ${c + Math.cos(((i + 1) / waves) * Math.PI * 2) * rr} ${c - EX * 0.4 + Math.sin(((i + 1) / waves) * Math.PI * 2) * rr}`;
  }
  return svgDoc(S, `
${halo(glaze)}
<circle cx="${c}" cy="${c + EX}" r="${r}" fill="#C79A4B" stroke="${OUTLINE}" stroke-width="${OW}"/>
<circle cx="${c}" cy="${c - EX * 0.4}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="${glazePath} Z" fill="${glaze}" stroke="${glazeDeep}" stroke-width="4"/>
<circle cx="${c}" cy="${c - EX * 0.4}" r="${hole}" fill="#160B33"/>
<circle cx="${c}" cy="${c - EX * 0.4}" r="${hole}" fill="none" stroke="${OUTLINE}" stroke-width="${OW * 0.7}"/>
${sprinkles}
${shine(c - r * 0.44, c - EX * 0.4 - r * 0.5, r * 0.26, r * 0.12, -24, 0.6)}`, defs);
}

const CAKE_FLAVORS: Array<[string, string, string]> = [
  ["#FF9FCB", "#FFF3DD", "#FF5D73"],  // strawberry
  ["#8B5A2E", "#F2CB6C", "#FF9FCB"],  // choco
];

export function cakeSlice(variant: number): string {
  const [top, body, cherry] = CAKE_FLAVORS[variant % CAKE_FLAVORS.length]!;
  const c = S / 2;
  const w = S * 0.56;
  const h = S * 0.4;
  const x0 = c - w / 2;
  const y0 = c - h / 2 + S * 0.03;
  const defs = haloDef(top) + vGradient("g", lighten(body, 0.15), darken(body, 0.08));
  const layer = (ly: number, color: string): string =>
    `<rect x="${x0}" y="${y0 + ly * h}" width="${w}" height="${h * 0.18}" fill="${color}" opacity="0.85"/>`;
  return svgDoc(S, `
${halo(top)}
<path d="M ${x0} ${y0} L ${x0 + w} ${y0} L ${x0 + w * 0.86} ${y0 + h + EX} L ${x0 + w * 0.14} ${y0 + h + EX} Z"
  fill="${darken(body, 0.4)}" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="M ${x0} ${y0} L ${x0 + w} ${y0} L ${x0 + w * 0.88} ${y0 + h} L ${x0 + w * 0.12} ${y0 + h} Z"
  fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
${layer(0.36, top)}
${layer(0.66, top)}
<path d="M ${x0 - 6} ${y0} L ${x0 + w + 6} ${y0}
  Q ${x0 + w * 0.85} ${y0 + h * 0.34} ${x0 + w * 0.7} ${y0 + h * 0.1}
  Q ${x0 + w * 0.55} ${y0 + h * 0.4} ${x0 + w * 0.42} ${y0 + h * 0.12}
  Q ${x0 + w * 0.3} ${y0 + h * 0.38} ${x0 + w * 0.15} ${y0 + h * 0.1} Z"
  fill="${top}" stroke="${OUTLINE}" stroke-width="${OW * 0.8}" stroke-linejoin="round"/>
<circle cx="${c}" cy="${y0 - S * 0.045}" r="${S * 0.055}" fill="${cherry}" stroke="${OUTLINE}" stroke-width="4"/>
${shine(c - S * 0.02, y0 - S * 0.06, S * 0.02, S * 0.012, -20)}
${sparkle(x0 + w * 0.85, y0 - S * 0.03, S * 0.035)}`, defs);
}

// ── DEATH_LOOT: radiant soul-orb (strong baked glow) ────────────────────────

export function soulOrb(): string {
  const c = S / 2;
  const r = S * 0.22;
  const defs = `<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="#FFD166" stop-opacity="0.9"/>
<stop offset="0.55" stop-color="#FFB545" stop-opacity="0.45"/>
<stop offset="1" stop-color="#FFA94D" stop-opacity="0"/>
</radialGradient>` + rGradient("g", "#FFFBEE", "#FFC66E");
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x1 = c + Math.cos(a) * r * 1.25;
    const y1 = c + Math.sin(a) * r * 1.25;
    const x2 = c + Math.cos(a) * r * 2.05;
    const y2 = c + Math.sin(a) * r * 2.05;
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="#FFE9BF" stroke-width="${7 - (i % 2) * 3}" stroke-linecap="round" opacity="0.85"/>`;
  }
  return svgDoc(S, `
<circle cx="${c}" cy="${c}" r="${S * 0.49}" fill="url(#halo)"/>
${rays}
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="#B57718" stroke-width="${OW * 0.7}"/>
<circle cx="${c}" cy="${c}" r="${r * 0.45}" fill="#FFFFFF" opacity="0.95"/>
${sparkle(c + r * 0.9, c - r * 0.9, r * 0.3)}
${sparkle(c - r * 1.1, c + r * 0.7, r * 0.2, 0.75)}`, defs);
}

// ── engine FX sprite: soft white radial for ADD-blend glows ─────────────────

export function fxGlow(): string {
  return svgDoc(S, `<circle cx="${S / 2}" cy="${S / 2}" r="${S * 0.5}" fill="url(#g)"/>`,
    `<radialGradient id="g" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/>
<stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.55"/>
<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</radialGradient>`);
}
