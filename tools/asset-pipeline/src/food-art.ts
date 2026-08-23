/** Wormate-style candy food set (docs/ART_STYLE.md).
 *  Bright glossy sweets with fat outlines, big top-left shine, saturated
 *  two-tone gradients, and per-kind variety so fields feel alive:
 *  COMMON  → round candy drops (6 colors)
 *  RARE    → wrapped bonbons with striped wings (3 colors)
 *  EPIC    → swirl lollipops (2 colors)
 *  BONUS   → glazed sprinkle donuts (2 glazes)
 *  DEATH_LOOT → glowing amber soul-orb
 */
import { OUTLINE, gloss, lighten, darken, rGradient, svgDoc, vGradient } from "./svg.js";

const S = 256;
const OW = S * 0.05;

/** small 4-point sparkle */
function sparkle(cx: number, cy: number, r: number, opacity = 0.9): string {
  return `<path d="M ${cx} ${cy - r} Q ${cx + r * 0.15} ${cy - r * 0.15} ${cx + r} ${cy}
    Q ${cx + r * 0.15} ${cy + r * 0.15} ${cx} ${cy + r}
    Q ${cx - r * 0.15} ${cy + r * 0.15} ${cx - r} ${cy}
    Q ${cx - r * 0.15} ${cy - r * 0.15} ${cx} ${cy - r} Z"
    fill="#ffffff" opacity="${opacity}"/>`;
}

// ── COMMON: candy drop ───────────────────────────────────────────────────────

export const CANDY_COLORS: Array<[string, string]> = [
  ["#FF5D73", "#D63A54"], // strawberry
  ["#FFB545", "#E8912B"], // mango
  ["#FFE066", "#EBC33B"], // lemon
  ["#5CE685", "#2FB95E"], // apple
  ["#64D2FF", "#3AA4D6"], // blueberry
  ["#C58AFF", "#9D5CE6"], // grape
];

export function candyDrop(variant: number): string {
  const [base, deep] = CANDY_COLORS[variant % CANDY_COLORS.length]!;
  const c = S / 2;
  const r = S * 0.34;
  const defs =
    rGradient("g", lighten(base, 0.35), base) +
    rGradient("halo", `${base}66`, `${base}00`);
  const body = `
<circle cx="${c}" cy="${c}" r="${S * 0.47}" fill="url(#halo)"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="M ${c - r} ${c} A ${r} ${r} 0 0 0 ${c + r} ${c} L ${c + r} ${c} A ${r * 0.98} ${r * 0.98} 0 0 1 ${c - r} ${c} Z"
  fill="${deep}" opacity="0.45"/>
<ellipse cx="${c - r * 0.34}" cy="${c - r * 0.4}" rx="${r * 0.36}" ry="${r * 0.24}"
  fill="#ffffff" opacity="0.85" transform="rotate(-26 ${c - r * 0.34} ${c - r * 0.4})"/>
${sparkle(c + r * 0.45, c - r * 0.5, r * 0.16)}`;
  return svgDoc(S, body, defs);
}

// ── RARE: wrapped bonbon ─────────────────────────────────────────────────────

const BONBON_COLORS: Array<[string, string, string]> = [
  ["#58E6B4", "#2FB98A", "#CFF9E9"], // mint
  ["#FF6FB5", "#D14A8F", "#FFD3EA"], // rose
  ["#FFA94D", "#E07F1F", "#FFE1BF"], // caramel
];

export function bonbon(variant: number): string {
  const [base, deep, light] = BONBON_COLORS[variant % BONBON_COLORS.length]!;
  const c = S / 2;
  const r = S * 0.27;
  const defs = rGradient("g", lighten(base, 0.3), base);
  const wing = (dir: number): string => {
    const x0 = c + dir * (r - OW * 0.4);
    const tipX = c + dir * r * 2.1;
    return `
<path d="M ${x0} ${c - r * 0.28}
  Q ${c + dir * r * 1.5} ${c - r * 0.75} ${tipX} ${c - r * 0.62}
  Q ${c + dir * r * 1.75} ${c} ${tipX} ${c + r * 0.62}
  Q ${c + dir * r * 1.5} ${c + r * 0.75} ${x0} ${c + r * 0.28} Z"
  fill="${base}" stroke="${OUTLINE}" stroke-width="${OW * 0.8}" stroke-linejoin="round"/>
<path d="M ${c + dir * r * 1.35} ${c - r * 0.5} Q ${c + dir * r * 1.5} ${c} ${c + dir * r * 1.35} ${c + r * 0.5}"
  fill="none" stroke="${deep}" stroke-width="${OW * 0.55}" stroke-linecap="round"/>`;
  };
  const body = `
${wing(-1)}
${wing(1)}
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="M ${c - r * 0.55} ${c - r * 0.83} Q ${c} ${c - r * 1.05} ${c + r * 0.55} ${c - r * 0.83}"
  fill="none" stroke="${light}" stroke-width="${OW * 0.8}" stroke-linecap="round" opacity="0.9"/>
<path d="M ${c - r * 0.75} ${c - r * 0.35} Q ${c} ${c - r * 0.6} ${c + r * 0.75} ${c - r * 0.35}"
  fill="none" stroke="${deep}" stroke-width="${OW * 0.7}" stroke-linecap="round" opacity="0.5"/>
<path d="M ${c - r * 0.75} ${c + r * 0.35} Q ${c} ${c + r * 0.1} ${c + r * 0.75} ${c + r * 0.35}"
  fill="none" stroke="${deep}" stroke-width="${OW * 0.7}" stroke-linecap="round" opacity="0.5"/>
<ellipse cx="${c - r * 0.3}" cy="${c - r * 0.42}" rx="${r * 0.3}" ry="${r * 0.18}"
  fill="#ffffff" opacity="0.8" transform="rotate(-24 ${c - r * 0.3} ${c - r * 0.42})"/>`;
  return svgDoc(S, body, defs);
}

// ── EPIC: swirl lollipop ─────────────────────────────────────────────────────

const LOLLI_COLORS: Array<[string, string]> = [
  ["#FF6FB5", "#ffffff"], // pink swirl
  ["#64D2FF", "#ffffff"], // sky swirl
];

export function lollipop(variant: number): string {
  const [base] = LOLLI_COLORS[variant % LOLLI_COLORS.length]!;
  const c = S / 2;
  const cx = c;
  const cy = c - S * 0.06;
  const r = S * 0.3;
  const defs = rGradient("g", lighten(base, 0.15), base);

  // archimedean spiral path
  let d = `M ${cx} ${cy}`;
  const turns = 2.6;
  const steps = 90;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2;
    const rad = (i / steps) * r * 0.82;
    d += ` L ${cx + Math.cos(t) * rad} ${cy + Math.sin(t) * rad}`;
  }

  const body = `
<rect x="${cx - OW * 0.65}" y="${cy + r * 0.5}" width="${OW * 1.3}" height="${S * 0.34}"
  rx="${OW * 0.6}" fill="#FFF3DD" stroke="${OUTLINE}" stroke-width="${OW * 0.45}"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${r * 0.19}" stroke-linecap="round" opacity="0.95"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${OUTLINE}" stroke-width="${OW}"/>
<ellipse cx="${cx - r * 0.36}" cy="${cy - r * 0.44}" rx="${r * 0.3}" ry="${r * 0.17}"
  fill="#ffffff" opacity="0.75" transform="rotate(-26 ${cx - r * 0.36} ${cy - r * 0.44})"/>
${sparkle(cx + r * 0.55, cy - r * 0.55, r * 0.17)}`;
  return svgDoc(S, body, defs);
}

// ── BONUS: glazed donut ──────────────────────────────────────────────────────

const GLAZES: Array<[string, string]> = [
  ["#FF9FCB", "#FF6FB5"], // strawberry glaze
  ["#B8862F", "#8B5A1E"], // chocolate glaze
];

export function donut(variant: number): string {
  const [glaze, glazeDeep] = GLAZES[variant % GLAZES.length]!;
  const c = S / 2;
  const r = S * 0.36;
  const hole = r * 0.36;
  const defs = rGradient("g", "#FFEBB8", "#F2CB6C");
  const sprinkleColors = ["#FF5D73", "#5CE685", "#64D2FF", "#FFE066", "#C58AFF"];
  const sprinkles = [
    [-0.5, -0.35, 25], [0.05, -0.6, 75], [0.5, -0.3, -20], [-0.6, 0.15, 60],
    [0.62, 0.18, 15], [-0.25, 0.55, -45], [0.3, 0.52, 30],
  ]
    .map(([dx, dy, rot], i) => {
      const x = c + (dx as number) * r;
      const y = c + (dy as number) * r;
      return `<rect x="${x - 10}" y="${y - 4}" width="20" height="8" rx="4"
        fill="${sprinkleColors[i % sprinkleColors.length]}" stroke="${OUTLINE}" stroke-width="2.5"
        transform="rotate(${rot} ${x} ${y})"/>`;
    })
    .join("");
  // wavy glaze edge
  let glazePath = "";
  const waves = 9;
  for (let i = 0; i <= waves; i++) {
    const a0 = (i / waves) * Math.PI * 2;
    const a1 = ((i + 0.5) / waves) * Math.PI * 2;
    const rr = r * 0.97;
    const rDip = r * 0.78;
    const x0 = c + Math.cos(a0) * rr;
    const y0 = c + Math.sin(a0) * rr;
    const xm = c + Math.cos(a1) * rDip;
    const ym = c + Math.sin(a1) * rDip;
    glazePath += i === 0 ? `M ${x0} ${y0}` : "";
    glazePath += ` Q ${xm} ${ym} ${c + Math.cos(((i + 1) / waves) * Math.PI * 2) * rr} ${c + Math.sin(((i + 1) / waves) * Math.PI * 2) * rr}`;
  }
  const body = `
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<path d="${glazePath} Z" fill="${glaze}" stroke="${glazeDeep}" stroke-width="${OW * 0.35}"/>
<circle cx="${c}" cy="${c}" r="${hole}" fill="#12082B"/>
<circle cx="${c}" cy="${c}" r="${hole}" fill="none" stroke="${OUTLINE}" stroke-width="${OW * 0.7}"/>
${sprinkles}
<ellipse cx="${c - r * 0.42}" cy="${c - r * 0.5}" rx="${r * 0.26}" ry="${r * 0.13}"
  fill="#ffffff" opacity="0.65" transform="rotate(-24 ${c - r * 0.42} ${c - r * 0.5})"/>`;
  return svgDoc(S, body, defs);
}

// ── DEATH_LOOT: soul orb ─────────────────────────────────────────────────────

export function soulOrb(): string {
  const c = S / 2;
  const r = S * 0.28;
  const defs =
    rGradient("g", "#FFF0CE", "#FFB545") +
    rGradient("halo", "#FFC97E99", "#FFA94D00");
  const body = `
<circle cx="${c}" cy="${c}" r="${S * 0.48}" fill="url(#halo)"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#g)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<circle cx="${c}" cy="${c}" r="${r * 0.45}" fill="#FFFBEE" opacity="0.95"/>
${gloss(c, c, r)}
${sparkle(c + r * 0.72, c - r * 0.72, r * 0.22)}
${sparkle(c - r * 0.85, c + r * 0.5, r * 0.14, 0.7)}`;
  return svgDoc(S, body, defs);
}

export { vGradient, darken };
