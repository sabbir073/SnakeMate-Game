import { expect, test } from "@playwright/test";
import { joinArena, probe, steer } from "./helpers.js";

test.describe("death and respawn", () => {
  test("hitting the arena edge shows the death screen; PLAY AGAIN respawns", async ({ page }) => {
    test.setTimeout(120_000);
    await joinArena(page, "WallRunner");

    // boost straight left until the world edge kills us
    await steer(page, 30, 360);
    await page.mouse.down();
    await page.waitForFunction(
      () => {
        const p = (window as unknown as { __nibblio?: { alive: boolean } }).__nibblio;
        return p !== undefined && !p.alive;
      },
      { timeout: 90_000, polling: 500 },
    );
    await page.mouse.up();

    // death screen with stats
    await expect(page.locator("#death")).toBeVisible();
    await expect(page.locator("#death-stats")).toContainText(/edge|Nibbled/);

    // respawn
    await page.click("#respawn");
    await page.waitForFunction(
      () => {
        const p = (window as unknown as { __nibblio?: { alive: boolean } }).__nibblio;
        return p?.alive === true;
      },
      { timeout: 15_000 },
    );
    await expect(page.locator("#death")).toBeHidden();
    const p = await probe(page);
    expect(p.alive).toBe(true);
  });
});
