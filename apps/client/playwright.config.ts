import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

/** Prefer PW_CHROMIUM_PATH, else a sandbox/CI-preinstalled Chromium, else
 *  Playwright's own registry download. */
const chromiumPath =
  process.env.PW_CHROMIUM_PATH ??
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

/** E2E config (spec §95–96). Boots the real game server + vite dev server. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 720 },
    // Sandbox/CI images may pin a Chromium outside Playwright's registry.
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  webServer: [
    {
      command: "pnpm --filter @nibblio/server dev",
      url: "http://localhost:2567/health",
      reuseExistingServer: true,
      timeout: 30_000,
      cwd: "../..",
    },
    {
      command: "pnpm --filter @nibblio/client dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30_000,
      cwd: "../..",
    },
  ],
});
