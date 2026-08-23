/** Asset pipeline (spec §38, §41, §83, §97).
 *
 *  M0 scaffold: walks assets/processed + assets/atlases + assets/audio,
 *  validates formats/paths, and writes the runtime manifest that the client
 *  loader consumes. The SVG→PNG rendering and atlas packing stages are added
 *  with the art pass (M2) — this file is their integration point.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AssetEntry, AssetManifest, AssetType, PreloadGroup } from "@nibblio/asset-types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const assetsDir = path.join(root, "assets");
const outManifest = path.join(root, "apps/client/public/assets-manifest.json");

const TYPE_BY_EXT: Record<string, AssetType> = {
  ".png": "image", ".webp": "image", ".avif": "image", ".svg": "image",
  ".json": "json",
  ".mp3": "audio", ".ogg": "audio", ".wav": "audio", ".m4a": "audio",
  ".woff2": "font", ".woff": "font", ".ttf": "font",
};

const GROUP_BY_DIR: Record<string, PreloadGroup> = {
  processed: "gameplay",
  atlases: "gameplay",
  audio: "gameplay",
  fonts: "core",
};

async function walk(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      ),
    );
    return files.flat();
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const groups = ["processed", "atlases", "audio", "fonts"] as const;
  const entries: AssetEntry[] = [];
  const problems: string[] = [];

  for (const group of groups) {
    const dir = path.join(assetsDir, group);
    for (const file of await walk(dir)) {
      const ext = path.extname(file).toLowerCase();
      const rel = path.relative(assetsDir, file).replaceAll("\\", "/");
      if (rel.split("/").some((seg) => seg === "tmp")) continue;
      const type = TYPE_BY_EXT[ext];
      if (!type) {
        problems.push(`unsupported format: ${rel}`);
        continue;
      }
      const buf = await fs.readFile(file);
      if (buf.length === 0) {
        problems.push(`empty asset: ${rel}`);
        continue;
      }
      const version = createHash("sha256").update(buf).digest("hex").slice(0, 10);
      entries.push({
        id: rel.replace(/\.[^.]+$/, "").replaceAll("/", "."),
        type,
        path: `assets/${rel}`,
        version,
        preload: GROUP_BY_DIR[group] ?? "gameplay",
      });
    }
  }

  if (problems.length > 0) {
    console.error("[asset-pipeline] validation problems:");
    for (const p of problems) console.error("  -", p);
    process.exitCode = 1;
    return;
  }

  const manifest: AssetManifest = {
    generatedAt: new Date().toISOString(),
    pipelineVersion: 1,
    entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
  };
  await fs.mkdir(path.dirname(outManifest), { recursive: true });
  await fs.writeFile(outManifest, JSON.stringify(manifest, null, 2));
  console.log(`[asset-pipeline] manifest written: ${entries.length} assets → ${path.relative(root, outManifest)}`);
}

void main();
