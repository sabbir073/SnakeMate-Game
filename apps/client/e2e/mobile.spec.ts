import { devices, expect, test } from "@playwright/test";
import { joinArena, probe } from "./helpers.js";

// iPhone 13 preset minus its webkit default — this suite runs on the pinned Chromium
const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"]!;
test.use(iphone);

test.describe("mobile viewport", () => {

  test("joins with touch controls visible and playable", async ({ page }) => {
    await joinArena(page, "TouchPlayer");
    // virtual controls mount on coarse-pointer devices
    await expect(page.locator("#boost-btn")).toBeVisible();
    await expect(page.locator("#joy-zone")).toBeAttached();

    const before = await probe(page);
    expect(before.alive).toBe(true);

    // drag on the joystick zone: steer right
    await page.touchscreen.tap(100, 500); // spawns the joystick base
    await page.waitForTimeout(300);
    const p1 = await probe(page);
    await page.waitForTimeout(2000);
    const p2 = await probe(page);
    // worm keeps moving regardless; it must still be alive with HUD visible
    expect(p2.alive).toBe(true);
    expect(Math.hypot(p2.x - p1.x, p2.y - p1.y)).toBeGreaterThan(100);
    await expect(page.locator("#score-panel")).toBeVisible();
  });

  test("home screen fits a small viewport", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#play")).toBeInViewport();
    await expect(page.locator("#nickname")).toBeInViewport();
    await expect(page.locator("#skins")).toBeInViewport();
  });
});
