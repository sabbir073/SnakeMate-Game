/** Wormate-style powerup pickups: round candy-button badges — white face,
 *  thick colored ring, bold colored glyph, soft glow halo. */
import { OUTLINE, lighten, rGradient, svgDoc } from "./svg.js";

const S = 256;
const OW = S * 0.045;

export const POWERUP_STYLE: Record<string, { ring: string; deep: string }> = {
  SPEED: { ring: "#FFB545", deep: "#E8912B" },
  MAGNET: { ring: "#FF5D73", deep: "#D63A54" },
  DOUBLE_GROWTH: { ring: "#5CE685", deep: "#2FB95E" },
  SHIELD: { ring: "#64D2FF", deep: "#3AA4D6" },
  BOOST_REDUCTION: { ring: "#FF8A5C", deep: "#E0642F" },
  SCORE_MULTIPLIER: { ring: "#C58AFF", deep: "#9D5CE6" },
  SCORE_X5: { ring: "#FFC53D", deep: "#DB9A18" },
  SCORE_X10: { ring: "#FF4D6D", deep: "#D92A4C" },
  ZOOM: { ring: "#FFE066", deep: "#EBC33B" },
};

/** The × mark used by all score-multiplier badges. */
function multX(color: string): string {
  return `
<path d="M 66 96 L 106 136 M 106 96 L 66 136" fill="none" stroke="${OUTLINE}" stroke-width="28" stroke-linecap="round"/>
<path d="M 66 96 L 106 136 M 106 96 L 66 136" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"/>`;
}

/** Stroke-drawn numeral (no fonts baked — hand-made vector digits). */
function numeral(n: "2" | "5" | "10", color: string): string {
  const stroke = (d: string): string =>
    `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (n) {
    case "2":
      return stroke("M 136 100 Q 136 78 160 78 Q 184 78 184 100 Q 184 114 148 152 L 188 152");
    case "5":
      return stroke("M 186 78 L 142 78 L 138 114 Q 162 104 178 120 Q 192 138 178 152 Q 160 164 140 150");
    case "10":
      return stroke("M 126 88 L 140 78 L 140 154") +
        stroke("M 180 78 Q 202 78 202 116 Q 202 154 180 154 Q 158 154 158 116 Q 158 78 180 78");
  }
}

/** Bold glyphs drawn in the badge color, centered in the 256 canvas. */
function glyph(kind: string, color: string, deep: string): string {
  const g = (d: string, extra = ""): string =>
    `<path d="${d}" fill="${color}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"${extra}/>`;
  switch (kind) {
    case "SPEED":
      return g("M 150 58 L 92 142 L 122 142 L 106 198 L 166 112 L 132 112 Z");
    case "MAGNET":
      return `
${g("M 90 70 L 90 132 a 38 38 0 0 0 76 0 L 166 70 L 196 70 L 196 132 a 68 68 0 0 1 -136 0 L 60 70 Z")}
<rect x="60" y="70" width="30" height="26" fill="#ffffff" stroke="${OUTLINE}" stroke-width="6"/>
<rect x="166" y="70" width="30" height="26" fill="#ffffff" stroke="${OUTLINE}" stroke-width="6"/>`;
    case "DOUBLE_GROWTH":
      return g("M 128 52 L 172 104 L 144 104 L 144 132 L 112 132 L 112 104 L 84 104 Z") +
        g("M 128 128 L 172 180 L 144 180 L 144 206 L 112 206 L 112 180 L 84 180 Z");
    case "SHIELD":
      return g("M 128 52 L 190 74 L 190 128 Q 190 178 128 206 Q 66 178 66 128 L 66 74 Z") +
        `<path d="M 100 122 L 122 144 L 160 100" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "BOOST_REDUCTION":
      return g("M 128 52 Q 170 96 162 138 Q 188 128 186 104 Q 210 160 170 194 Q 148 210 118 206 Q 78 198 72 152 Q 68 118 96 90 Q 92 122 110 130 Q 100 88 128 52 Z");
    case "SCORE_MULTIPLIER":
      return multX(color) + numeral("2", color);
    case "SCORE_X5":
      return multX(color) + numeral("5", color);
    case "SCORE_X10":
      return multX(color) + numeral("10", color);
    case "ZOOM":
      return `
<circle cx="114" cy="112" r="44" fill="#ffffff" stroke="${OUTLINE}" stroke-width="9"/>
<circle cx="114" cy="112" r="44" fill="none" stroke="${color}" stroke-width="14"/>
<path d="M 146 148 L 186 190" stroke="${OUTLINE}" stroke-width="30" stroke-linecap="round"/>
<path d="M 146 148 L 184 188" stroke="${deep}" stroke-width="18" stroke-linecap="round"/>
<path d="M 98 112 L 130 112 M 114 96 L 114 128" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`;
    default:
      return "";
  }
}

export function powerupBadge(kind: string): string {
  const style = POWERUP_STYLE[kind] ?? POWERUP_STYLE.SPEED!;
  const c = S / 2;
  const rOuter = S * 0.4;
  const rFace = S * 0.31;
  const defs =
    rGradient("face", "#FFFFFF", "#EDE6FA") +
    rGradient("ring", lighten(style.ring, 0.2), style.ring) +
    rGradient("halo", `${style.ring}66`, `${style.ring}00`);
  const body = `
<circle cx="${c}" cy="${c}" r="${S * 0.49}" fill="url(#halo)"/>
<circle cx="${c}" cy="${c}" r="${rOuter}" fill="url(#ring)" stroke="${OUTLINE}" stroke-width="${OW}"/>
<circle cx="${c}" cy="${c}" r="${rFace}" fill="url(#face)" stroke="${OUTLINE}" stroke-width="${OW * 0.7}"/>
<g transform="translate(${c} ${c}) scale(0.62) translate(${-c} ${-c})">${glyph(kind, style.ring, style.deep)}</g>
<ellipse cx="${c - rOuter * 0.3}" cy="${c - rOuter * 0.52}" rx="${rOuter * 0.34}" ry="${rOuter * 0.16}"
  fill="#ffffff" opacity="0.65" transform="rotate(-24 ${c - rOuter * 0.3} ${c - rOuter * 0.52})"/>`;
  return svgDoc(S, body, defs);
}
