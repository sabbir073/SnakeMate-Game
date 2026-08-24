/** Versioned asset URLs (cache correctness).
 *
 *  Static assets are served with long-lived immutable caching, but their file
 *  NAMES are stable across releases — so after a redeploy a browser could mix
 *  an old cached atlas image with a new layout JSON (sprites showing halves
 *  of neighboring frames). The fix: the manifest (fetched fresh, no-store)
 *  carries a content hash per asset, and every runtime URL appends `?v=hash`.
 *  New content ⇒ new URL ⇒ cache miss ⇒ always-consistent pairs. */

interface ManifestEntry {
  path: string;
  version: string;
}

let versions = new Map<string, string>();

export async function initAssetVersions(): Promise<void> {
  try {
    const res = await fetch("/assets-manifest.json", { cache: "no-store" });
    if (!res.ok) return;
    const manifest = (await res.json()) as { entries?: ManifestEntry[] };
    versions = new Map(
      (manifest.entries ?? []).map((e) => [`/${e.path}`, e.version]),
    );
  } catch {
    // manifest unreachable — un-versioned URLs still work, just cache-riskier
  }
}

/** `/assets/foo.png` → `/assets/foo.png?v=<hash>` (identity when unknown). */
export function assetUrl(path: string): string {
  const v = versions.get(path);
  return v ? `${path}?v=${v}` : path;
}

/** The atlas JSON shares its image's version (they're built as one unit). */
export function atlasUrls(): { texture: string; data: string } {
  const v = versions.get("/assets/game-atlas.png");
  return {
    texture: v ? `/assets/game-atlas.png?v=${v}` : "/assets/game-atlas.png",
    data: v ? `/assets/game-atlas.json?v=${v}` : "/assets/game-atlas.json",
  };
}
