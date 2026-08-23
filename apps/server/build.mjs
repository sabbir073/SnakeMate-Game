import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// Bundle workspace packages (they export TS source); keep real deps external.
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith("@nibblio/"));

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
  define: {
    __SERVER_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    // ESM bundles lose require(); some deps probe for it.
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
