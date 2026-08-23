declare const __SERVER_VERSION__: string | undefined;

/** Injected by esbuild in builds; falls back for tsx dev runs. */
export const SERVER_VERSION: string =
  typeof __SERVER_VERSION__ === "string" ? __SERVER_VERSION__ : "0.1.0-dev";
