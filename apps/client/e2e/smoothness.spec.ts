import { expect, test } from "@playwright/test";
import { joinArena, probe } from "./helpers.js";

test.describe("motion quality & zoom fairness", () => {
  test("local worm renders without periodic judder", async ({ page }) => {
    await joinArena(page, "SmoothCheck");
    // steer toward the world center so the wall can't interrupt the sample
    const p0 = await probe(page) as unknown as { x: number; y: number; worldSize: number };
    const half = (p0.worldSize || 18000) / 2;
    await page.mouse.move(p0.x < half ? 1100 : 180, p0.y < half ? 620 : 100);
    await page.waitForTimeout(1500);

    // sample the RENDERED position every animation frame for ~2s
    const speeds = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          let last: { x: number; y: number; t: number } | null = null;
          let frames = 0;
          function tick(now: number): void {
            const p = (window as unknown as {
              __nibblio?: { renderX: number; renderY: number };
            }).__nibblio;
            if (p) {
              if (last) {
                const dt = (now - last.t) / 1000;
                if (dt > 0.001) {
                  out.push(Math.hypot(p.renderX - last.x, p.renderY - last.y) / dt);
                }
              }
              last = { x: p.renderX, y: p.renderY, t: now };
            }
            if (++frames < 120) requestAnimationFrame(tick);
            else resolve(out);
          }
          requestAnimationFrame(tick);
        }),
    );

    expect(speeds.length).toBeGreaterThan(60);
    // 3-frame moving average removes headless-rAF measurement noise while
    // preserving the ~1 Hz aliasing beat this test exists to catch
    const smooth: number[] = [];
    for (let i = 2; i < speeds.length; i++) {
      smooth.push((speeds[i]! + speeds[i - 1]! + speeds[i - 2]!) / 3);
    }
    const avg = smooth.reduce((a, b) => a + b, 0) / smooth.length;
    const variance = smooth.reduce((a, b) => a + (b - avg) ** 2, 0) / smooth.length;
    const cv = Math.sqrt(variance) / avg; // coefficient of variation
    // pre-fix, fixed-timestep aliasing gave bimodal 0/2× steps (cv ≈ 0.5+);
    // interpolated rendering must be steady even on a slow software renderer
    expect(avg).toBeGreaterThan(100); // actually cruising
    expect(cv).toBeLessThan(0.3);
  });

  test("resizing the viewport (≈browser zoom) never reveals more world", async ({ page }) => {
    await joinArena(page, "ZoomCheck");
    await page.waitForTimeout(1500);
    const small = await page.evaluate(
      () => (window as unknown as { __nibblio: { viewW: number; viewH: number } }).__nibblio,
    );

    // simulate zooming out / a much larger canvas
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1500); // camera zoom eases to the new target
    const big = await page.evaluate(
      () => (window as unknown as { __nibblio: { viewW: number; viewH: number } }).__nibblio,
    );

    // visible world width must stay ~constant (±8% during easing)
    expect(Math.abs(big.viewW - small.viewW) / small.viewW).toBeLessThan(0.08);
  });
});
