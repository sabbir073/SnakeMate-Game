import type { Page } from "@playwright/test";

export interface NibblioProbe {
  alive: boolean;
  mass: number;
  score: number;
  remoteCount: number;
  foodCount: number;
  predictionError: number;
  pendingInputs: number;
  x: number;
  y: number;
}

let channelCounter = 0;

/** Unique matchmaking channel per test invocation → fresh isolated room. */
export function freshChannel(): string {
  channelCounter++;
  return `t${Date.now().toString(36)}-${channelCounter}`;
}

export async function joinArena(
  page: Page, nickname: string, path = "/", channel?: string,
): Promise<void> {
  const ch = channel ?? freshChannel();
  const sep = path.includes("?") ? "&" : "?";
  await page.goto(`${path}${sep}room=${ch}`);
  await page.fill("#nickname", nickname);
  await page.click("#play");
  // HUD appears once connected and the scene booted
  await page.waitForSelector("#hud.visible", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const p = (window as unknown as { __nibblio?: { alive: boolean } }).__nibblio;
    return p !== undefined;
  });
}

export async function probe(page: Page): Promise<NibblioProbe> {
  return (await page.evaluate(
    () => (window as unknown as { __nibblio: unknown }).__nibblio,
  )) as NibblioProbe;
}

/** Steer by moving the mouse to a point of the viewport (worm follows pointer). */
export async function steer(page: Page, vx: number, vy: number): Promise<void> {
  await page.mouse.move(vx, vy);
}
