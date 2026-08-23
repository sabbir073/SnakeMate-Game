import { expect, test } from "@playwright/test";
import { joinArena, probe, steer } from "./helpers.js";

test.describe("single client", () => {
  test("homepage loads with branding and play flow", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#logo-title")).toHaveText(/NIBBLIO/);
    await expect(page.locator("#play")).toBeVisible();
    await expect(page.locator("#nickname")).toBeVisible();
    const title = await page.title();
    expect(title.toLowerCase()).toContain("nibblio");
  });

  test("joins the arena and the worm lives and moves", async ({ page }) => {
    await joinArena(page, "SoloTester");
    const before = await probe(page);
    expect(before.alive).toBe(true);

    // steer to the right for 2 seconds — position must change
    await steer(page, 1100, 360);
    await page.waitForTimeout(2000);
    const after = await probe(page);
    expect(after.alive).toBe(true);
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    expect(moved).toBeGreaterThan(100);
  });

  test("collects food and grows (score + mass increase)", async ({ page }) => {
    await joinArena(page, "Muncher");
    const start = await probe(page);
    expect(start.foodCount).toBeGreaterThan(0); // food synced from server

    // cruise in a few directions; ambient food density guarantees pickups
    const headings: Array<[number, number]> = [
      [1100, 360], [640, 650], [200, 360], [640, 100],
    ];
    let grew = false;
    for (let round = 0; round < 8 && !grew; round++) {
      await steer(page, ...(headings[round % headings.length] as [number, number]));
      await page.waitForTimeout(2500);
      const now = await probe(page);
      if (now.mass > start.mass && now.score > start.score) grew = true;
      if (!now.alive) break; // unlucky wall hit — fail below with context
    }
    const end = await probe(page);
    expect(end.alive).toBe(true);
    expect(end.mass).toBeGreaterThan(start.mass);
    expect(end.score).toBeGreaterThan(start.score);
  });

  test("prediction stays in sync with the server (small reconciliation error)", async ({ page }) => {
    await joinArena(page, "Predictor");
    await steer(page, 1000, 500);
    await page.waitForTimeout(3000);
    const p = await probe(page);
    expect(p.alive).toBe(true);
    // prediction error after reconcile should be tiny on a local connection
    expect(p.predictionError).toBeLessThan(20);
    // input buffer must not grow unboundedly
    expect(p.pendingInputs).toBeLessThan(30);
  });
});
