/** SVG composition helpers for the Nibblio art pipeline.
 *  Style bible (docs/ART_STYLE.md): soft rounded geometry, bold dark outline
 *  (#2B1A3D), top-left glossy highlight, subtle vertical gradient, candy
 *  palette on deep purple. Everything is parametric + deterministic. */

export const OUTLINE = "#2B1A3D";

export function svgDoc(size: number, content: string, defs = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>${defs}</defs>
${content}
</svg>`;
}

export function vGradient(id: string, top: string, bottom: string): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/>
</linearGradient>`;
}

export function rGradient(id: string, inner: string, outer: string): string {
  return `<radialGradient id="${id}" cx="0.5" cy="0.42" r="0.65">
<stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/>
</radialGradient>`;
}

/** Lighten a #rrggbb color toward white by t (0..1). */
export function lighten(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (c: number): number => Math.round(c + (255 - c) * t);
  return `#${((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, "0")}`;
}

export function darken(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (c: number): number => Math.round(c * (1 - t));
  return `#${((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, "0")}`;
}

/** Candy ball: outlined gradient circle + glossy top-left highlight. */
export function candyBall(
  cx: number, cy: number, r: number, gradId: string, outlineW: number,
): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gradId})" stroke="${OUTLINE}" stroke-width="${outlineW}"/>
${gloss(cx, cy, r)}`;
}

export function gloss(cx: number, cy: number, r: number): string {
  const gx = cx - r * 0.32;
  const gy = cy - r * 0.42;
  return `<ellipse cx="${gx}" cy="${gy}" rx="${r * 0.34}" ry="${r * 0.22}" fill="#ffffff" opacity="0.55" transform="rotate(-24 ${gx} ${gy})"/>`;
}

/** Cartoon eye: white ball, iris-less big pupil, sparkle. Angle 0 = looking right. */
export function eye(cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="${OUTLINE}" stroke-width="${r * 0.14}"/>
<circle cx="${cx + r * 0.28}" cy="${cy + r * 0.05}" r="${r * 0.48}" fill="#241435"/>
<circle cx="${cx + r * 0.45}" cy="${cy - r * 0.18}" r="${r * 0.16}" fill="#ffffff"/>`;
}
