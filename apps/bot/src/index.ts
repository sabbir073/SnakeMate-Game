/** Nibblio bot runner & load harness (spec §51–52).
 *
 *  Smoke:      pnpm --filter @nibblio/bot start -- --count 5 --duration 20
 *  Load sweep: pnpm test:load        (profiles 10..200, metrics sampled)
 *  Single:     tsx src/index.ts --count 100 --duration 60 --url ws://host/ws
 */
import { Bot } from "./bot.js";
import type { BotStats } from "./bot.js";

interface Args {
  count: number;
  url: string;
  httpUrl: string;
  durationSec: number;
  sweep: boolean;
  channel: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const url = get("--url") ?? process.env.BOT_SERVER_URL ?? "ws://localhost:2567";
  const httpUrl = get("--http")
    ?? url.replace(/^ws/, "http").replace(/\/ws\/?$/, "");
  return {
    count: Number(get("--count") ?? 5),
    url,
    httpUrl,
    durationSec: Number(get("--duration") ?? 20),
    sweep: argv.includes("--sweep"),
    channel: get("--channel") ?? `load-${Date.now().toString(36)}`,
  };
}

interface MetricsSample {
  cpuPct: number;
  rssMb: number;
  eventLoopLagMs: number;
  totals: { players: number; tickAvgMsMax: number; tickMaxMsMax: number };
}

async function sampleMetrics(httpUrl: string): Promise<MetricsSample | null> {
  try {
    const res = await fetch(`${httpUrl}/metrics`);
    if (!res.ok) return null;
    return (await res.json()) as MetricsSample;
  } catch {
    return null;
  }
}

export interface ProfileResult {
  bots: number;
  joined: number;
  errors: number;
  disconnects: number;
  deaths: number;
  inputsSent: number;
  cpuPctAvg: number;
  cpuPctMax: number;
  rssMbMax: number;
  tickAvgMs: number;
  tickMaxMs: number;
  lagMaxMs: number;
}

async function runProfile(args: Args, count: number): Promise<ProfileResult> {
  const stats: BotStats = {
    joined: 0, errors: 0, disconnects: 0, inputsSent: 0, deaths: 0, respawns: 0,
  };
  const channel = `${args.channel}-${count}`;
  const bots = Array.from({ length: count }, (_, i) => new Bot(i, args.url, channel, stats));

  // staggered join (40/s) — matches realistic arrival, avoids join stampede
  for (let i = 0; i < bots.length; i++) {
    void bots[i]!.start();
    await new Promise((r) => setTimeout(r, 25));
  }

  const samples: MetricsSample[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < args.durationSec * 1000) {
    await new Promise((r) => setTimeout(r, 2000));
    const m = await sampleMetrics(args.httpUrl);
    if (m) samples.push(m);
  }

  await Promise.all(bots.map((b) => b.stop()));
  await new Promise((r) => setTimeout(r, 500));

  const nums = (f: (m: MetricsSample) => number): number[] => samples.map(f);
  const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const max = (xs: number[]): number => (xs.length ? Math.max(...xs) : 0);

  return {
    bots: count,
    joined: stats.joined,
    errors: stats.errors,
    disconnects: stats.disconnects,
    deaths: stats.deaths,
    inputsSent: stats.inputsSent,
    cpuPctAvg: Math.round(avg(nums((m) => m.cpuPct))),
    cpuPctMax: Math.round(max(nums((m) => m.cpuPct))),
    rssMbMax: Math.round(max(nums((m) => m.rssMb))),
    tickAvgMs: Number(avg(nums((m) => m.totals.tickAvgMsMax)).toFixed(2)),
    tickMaxMs: Number(max(nums((m) => m.totals.tickMaxMsMax)).toFixed(2)),
    lagMaxMs: Number(max(nums((m) => m.eventLoopLagMs)).toFixed(1)),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const profiles = args.sweep ? [10, 25, 50, 75, 100, 150, 200] : [args.count];

  console.log(`[load] target ${args.url} (metrics: ${args.httpUrl}) — profiles: ${profiles.join(", ")}`);
  const results: ProfileResult[] = [];

  for (const count of profiles) {
    console.log(`\n[load] ── profile: ${count} bots for ${args.durationSec}s ──`);
    const r = await runProfile(args, count);
    results.push(r);
    console.log(
      `[load] ${r.bots} bots → joined=${r.joined} errors=${r.errors} deaths=${r.deaths} | ` +
      `cpu ${r.cpuPctAvg}%avg/${r.cpuPctMax}%max rss ${r.rssMbMax}MB | ` +
      `tick ${r.tickAvgMs}ms avg / ${r.tickMaxMs}ms max | loop-lag ${r.lagMaxMs}ms`,
    );
    // cool-down between profiles so rooms dispose
    await new Promise((r2) => setTimeout(r2, 3000));
  }

  console.log("\n[load] ── results (markdown) ──");
  console.log("| bots | joined | errors | tick avg (ms) | tick max (ms) | CPU avg/max | RSS max | loop lag max |");
  console.log("|---:|---:|---:|---:|---:|---|---:|---:|");
  for (const r of results) {
    console.log(
      `| ${r.bots} | ${r.joined} | ${r.errors} | ${r.tickAvgMs} | ${r.tickMaxMs} | ` +
      `${r.cpuPctAvg}% / ${r.cpuPctMax}% | ${r.rssMbMax} MB | ${r.lagMaxMs} ms |`,
    );
  }

  const failed = results.some((r) => r.joined < r.bots || r.errors > r.bots * 0.02);
  if (failed) {
    console.error("[load] FAILED thresholds (joins incomplete or >2% errors)");
    process.exitCode = 1;
  }
}

void main();
