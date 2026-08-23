import { expect, test } from "@playwright/test";
import { joinArena, probe } from "./helpers.js";

test.describe("reconnect", () => {
  test("unexpected socket drop shows overlay, resumes the same worm", async ({ page }) => {
    await joinArena(page, "Resilient");

    // grow a bit so we can verify session continuity via mass
    await page.mouse.move(1000, 360);
    await page.waitForTimeout(4000);
    const before = await probe(page);
    expect(before.alive).toBe(true);

    // force-close the websocket without a consented leave
    await page.evaluate(() => {
      (window as unknown as { __nibblioDrop: () => void }).__nibblioDrop();
    });

    // overlay appears, then clears after resume
    await expect(page.locator("#reconnect")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#reconnect")).toBeHidden({ timeout: 20_000 });

    await page.waitForTimeout(1500);
    const after = await probe(page);
    expect(after.alive).toBe(true);
    // same session: mass carried over (>= spawn mass + what we ate, minus nothing)
    expect(after.mass).toBeGreaterThanOrEqual(before.mass - 1);
  });

  test("settings modal opens from home", async ({ page }) => {
    await page.goto("/");
    await page.click("#settings-btn-home");
    await expect(page.locator("#settings-modal")).toBeVisible();
    await expect(page.locator("#set-music")).toBeVisible();
    await page.click("#settings-close");
    await expect(page.locator("#settings-modal")).toBeHidden();
  });
});
