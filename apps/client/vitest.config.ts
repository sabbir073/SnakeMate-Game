import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright owns e2e/**; vitest runs unit tests only
    exclude: ["e2e/**", "node_modules/**", "dist/**", "test-results/**"],
    passWithNoTests: true,
  },
});
