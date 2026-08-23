import { expect, test } from "@playwright/test";

test.describe("landing & PWA surfaces", () => {
  test("manifest is linked and served", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBe("/manifest.webmanifest");
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as { name: string; icons: unknown[] };
    expect(manifest.name).toContain("Nibblio");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  test("service worker file is served", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBe(true);
    expect(await res.text()).toContain("nibblio-static");
  });

  test("legal pages load with content and a way back", async ({ page }) => {
    for (const [path, needle] of [
      ["/legal/about.html", "How to play"],
      ["/legal/privacy.html", "Privacy Policy"],
      ["/legal/terms.html", "Terms of Service"],
    ] as const) {
      await page.goto(path);
      await expect(page.locator("h1")).toContainText(needle);
      await expect(page.locator("a.back")).toBeVisible();
    }
  });

  test("home screen links to the legal pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('.footer-links a[href="/legal/privacy.html"]')).toBeVisible();
    await expect(page.locator('.footer-links a[href="/legal/terms.html"]')).toBeVisible();
    await expect(page.locator('.footer-links a[href="/legal/about.html"]')).toBeVisible();
  });
});
