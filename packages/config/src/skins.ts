/** Data-driven skin system (spec §82). Rendering reads colors/asset ids from
 *  here; unlock rules (future economy) live elsewhere — renderers never know
 *  purchase logic. Colors are the same palette the art pipeline bakes into
 *  the atlas, so vector fallbacks and sprites always match. */

export interface SkinDef {
  id: string;
  name: string;
  rarity: "common" | "rare" | "epic";
  /** main body color */
  base: string;
  /** darker shade (outline/underside) */
  shade: string;
  /** accent (stripes/pattern) */
  accent: string;
  /** numeric tint for engine use (same as base) */
  baseTint: number;
  /** ring pattern: colors cycled along the body segments (premium look). */
  rings: readonly number[];
  unlockType: "default" | "coins" | "event";
}

function tint(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

const def = (
  id: string, name: string, rarity: SkinDef["rarity"],
  base: string, shade: string, accent: string,
  ringHex: readonly string[],
  unlockType: SkinDef["unlockType"] = "default",
): SkinDef => ({
  id, name, rarity, base, shade, accent,
  baseTint: tint(base),
  rings: ringHex.map(tint),
  unlockType,
});

export const SKINS: readonly SkinDef[] = [
  def("s0", "Mango", "common", "#FFB545", "#D68A1E", "#FFE08A",
    ["#FFB545", "#FF8A5C", "#FFD166"]),
  def("s1", "Bubblegum", "common", "#FF6FB5", "#D14A8F", "#FFC2E0",
    ["#FF6FB5", "#FFC2E0", "#FF8FA3"]),
  def("s2", "Minty", "common", "#58E6B4", "#2FB98A", "#B8F7E1",
    ["#58E6B4", "#2FB98A"]),
  def("s3", "Skyberry", "common", "#64D2FF", "#3AA4D6", "#C0EDFF",
    ["#64D2FF", "#C0EDFF", "#3AA4D6"]),
  def("s4", "Grape Jam", "rare", "#9D6BFF", "#7443D6", "#D3BDFF",
    ["#9D6BFF", "#D3BDFF"]),
  def("s5", "Sunburst", "rare", "#FFE066", "#D6B33A", "#FF8A5C",
    ["#FFE066", "#FF8A5C", "#FF5D73", "#FF8A5C"]),
] as const;

export const DEFAULT_SKIN = "s0";

export function skinById(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? (SKINS[0] as SkinDef);
}
