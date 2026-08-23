/** Nibblio bot runner — headless clients for load testing (spec §51–52).
 *
 *  M0 scaffold: connects N bots that wander with seeded-random steering.
 *  M3 adds behaviors (seek food, avoid, hunt, escape) and full metric capture.
 *
 *  Usage:
 *    pnpm --filter @nibblio/bot start -- --count 5 --url ws://localhost:2567
 *    pnpm test:load            # 10-bot smoke profile
 */
import { Client } from "colyseus.js";
import type { Room } from "colyseus.js";
import { NET } from "@nibblio/config";
import { ARENA_ROOM, MSG, PROTOCOL_VERSION } from "@nibblio/protocol";
import type { InputMessage } from "@nibblio/protocol";
import { createRng } from "@nibblio/shared";

interface Args {
  count: number;
  url: string;
  durationSec: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    count: Number(get("--count") ?? get("--profile") ?? 2),
    url: get("--url") ?? process.env.BOT_SERVER_URL ?? "ws://localhost:2567",
    durationSec: Number(get("--duration") ?? 20),
  };
}

interface BotStats {
  joined: number;
  errors: number;
  disconnects: number;
  inputsSent: number;
}

async function runBot(
  id: number,
  args: Args,
  stats: BotStats,
): Promise<void> {
  const rng = createRng(1000 + id);
  const client = new Client(args.url);
  let room: Room;
  try {
    room = await client.joinOrCreate(ARENA_ROOM, {
      protocolVersion: PROTOCOL_VERSION,
      nickname: `Bot${id}`,
      skinId: "s0",
    });
    stats.joined++;
  } catch (err) {
    stats.errors++;
    console.error(`[bot ${id}] join failed:`, (err as Error).message);
    return;
  }

  room.onLeave(() => { stats.disconnects++; });
  room.onMessage(MSG.death, () => room.send(MSG.respawn));
  // ignore other broadcast channels
  room.onMessage("*", () => { /* noop */ });

  let seq = 0;
  let angle = rng.range(-Math.PI, Math.PI);
  const interval = setInterval(() => {
    // wander: occasional random heading changes, occasional boost
    if (rng.next() < 0.05) angle = rng.range(-Math.PI, Math.PI);
    const input: InputMessage = { seq: ++seq, angle, boost: rng.next() < 0.08 };
    try {
      room.send(MSG.input, input);
      stats.inputsSent++;
    } catch {
      stats.errors++;
    }
  }, 1000 / NET.inputRate);

  await new Promise((r) => setTimeout(r, args.durationSec * 1000));
  clearInterval(interval);
  await room.leave(true).catch(() => stats.errors++);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[bot-runner] ${args.count} bots → ${args.url} for ${args.durationSec}s`);
  const stats: BotStats = { joined: 0, errors: 0, disconnects: 0, inputsSent: 0 };
  const t0 = Date.now();

  await Promise.all(
    Array.from({ length: args.count }, (_, i) => runBot(i, args, stats)),
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[bot-runner] done in ${elapsed}s — joined=${stats.joined}/${args.count} ` +
    `inputs=${stats.inputsSent} disconnects=${stats.disconnects} errors=${stats.errors}`,
  );
  if (stats.joined < args.count || stats.errors > 0) {
    process.exitCode = 1;
  }
}

void main();
