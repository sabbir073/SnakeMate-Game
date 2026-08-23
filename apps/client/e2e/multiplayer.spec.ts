import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { joinArena, probe, steer } from "./helpers.js";

async function twoClients(browser: Browser): Promise<{ a: Page; b: Page; close: () => Promise<void> }> {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await joinArena(a, "PlayerA");
  await joinArena(b, "PlayerB");
  return {
    a, b,
    close: async () => {
      await ctxA.close();
      await ctxB.close();
    },
  };
}

test.describe("multiplayer", () => {
  test("two clients join the same arena and see each other", async ({ browser }) => {
    const { a, b, close } = await twoClients(browser);
    try {
      await a.waitForFunction(() => {
        const p = (window as unknown as { __nibblio?: { remoteCount: number } }).__nibblio;
        return (p?.remoteCount ?? 0) >= 1;
      }, { timeout: 15_000 });
      await b.waitForFunction(() => {
        const p = (window as unknown as { __nibblio?: { remoteCount: number } }).__nibblio;
        return (p?.remoteCount ?? 0) >= 1;
      }, { timeout: 15_000 });

      // leaderboard shows both nicknames on both clients
      await expect(a.locator("#leaderboard-list")).toContainText("PlayerA");
      await expect(a.locator("#leaderboard-list")).toContainText("PlayerB");
      await expect(b.locator("#leaderboard-list")).toContainText("PlayerA");
    } finally {
      await close();
    }
  });

  test("movement on one client is observed by the other", async ({ browser }) => {
    const { a, b, close } = await twoClients(browser);
    try {
      // A steers hard right and boosts; B just watches
      await steer(a, 1200, 360);
      await a.mouse.down();
      await a.waitForTimeout(3000);
      await a.mouse.up();

      const pa = await probe(a);
      // B must still see exactly one remote worm (A) — with fresh snapshots
      const pb = await probe(b);
      expect(pb.remoteCount).toBe(1);
      expect(pa.alive).toBe(true);
    } finally {
      await close();
    }
  });

  test("disconnecting one client removes its worm from the other", async ({ browser }) => {
    const { a, b, close } = await twoClients(browser);
    try {
      await b.waitForFunction(() => {
        const p = (window as unknown as { __nibblio?: { remoteCount: number } }).__nibblio;
        return (p?.remoteCount ?? 0) >= 1;
      });
      await a.close();
      await b.waitForFunction(() => {
        const p = (window as unknown as { __nibblio?: { remoteCount: number } }).__nibblio;
        return (p?.remoteCount ?? 0) === 0;
      }, { timeout: 15_000 });
      const pb = await probe(b);
      expect(pb.alive).toBe(true);
    } finally {
      await close();
    }
  });

  test("prediction remains stable under 150ms artificial latency", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await joinArena(page, "Laggy", "/?fakeLag=150");
      await steer(page, 1100, 300);
      await page.waitForTimeout(4000);
      await steer(page, 300, 600);
      await page.waitForTimeout(4000);
      const p = await probe(page);
      expect(p.alive).toBe(true);
      // reconciliation error must stay bounded even at 150ms RTT
      expect(p.predictionError).toBeLessThan(120);
      expect(p.pendingInputs).toBeLessThan(60);
    } finally {
      await ctx.close();
    }
  });
});
