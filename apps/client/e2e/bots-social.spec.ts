import { expect, test } from "@playwright/test";
import { freshChannel, joinArena, probe } from "./helpers.js";

test.describe("resident bots, invite links, minimap", () => {
  test("bot-enabled arenas always have AI worms playing and ranked", async ({ page }) => {
    const channel = `bots-${freshChannel()}`;
    await joinArena(page, "Human1", "/", channel);

    // bots appear within the first population tick (1s) + sync
    await page.waitForFunction(() => {
      const p = (window as unknown as { __nibblio?: { remoteCount: number } }).__nibblio;
      return (p?.remoteCount ?? 0) >= 3;
    }, { timeout: 15_000 });

    // they compete on the live leaderboard like real players
    await expect(page.locator("#leaderboard-list li")).not.toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator("#own-rank")).toContainText(/of [2-9]/);
  });

  test("isolated test channels stay bot-free", async ({ page }) => {
    await joinArena(page, "Loner"); // freshChannel → no bots
    await page.waitForTimeout(3000);
    const p = await probe(page);
    expect(p.remoteCount).toBe(0);
  });

  test("invite link lands a friend in the SAME room", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    try {
      await joinArena(a, "Host");
      const pa = (await probe(a)) as unknown as { roomId: string };
      expect(pa.roomId).toBeTruthy();

      // friend opens the invite URL (no channel — the join id wins)
      await b.goto(`/?join=${pa.roomId}`);
      await b.fill("#nickname", "Friend");
      await b.click("#play");
      await b.waitForSelector("#hud.visible", { timeout: 20_000 });
      await b.waitForFunction(() => (window as unknown as { __nibblio?: unknown }).__nibblio !== undefined);

      const pb = (await probe(b)) as unknown as { roomId: string };
      expect(pb.roomId).toBe(pa.roomId);

      // and they see each other
      await a.waitForFunction(() => {
        const p = (window as unknown as { __nibblio?: { remoteCount: number } }).__nibblio;
        return (p?.remoteCount ?? 0) >= 1;
      }, { timeout: 15_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test("minimap is visible in-game", async ({ page }) => {
    await joinArena(page, "MapFan");
    await expect(page.locator("#minimap")).toBeVisible();
    await expect(page.locator("#invite-btn")).toBeVisible();
  });
});
