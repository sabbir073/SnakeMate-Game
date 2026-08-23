/** Server performance monitor (spec §50) — data behind GET /metrics.
 *  Rooms self-register; a lag sampler measures event-loop health. */

export interface RoomMetrics {
  roomId: string;
  players: number;
  worms: number;
  food: number;
  /** rolling window (last ~5s) */
  tickAvgMs: number;
  tickMaxMs: number;
  tick: number;
}

type RoomMetricsProvider = () => RoomMetrics;

const rooms = new Map<string, RoomMetricsProvider>();

export function registerRoom(roomId: string, provider: RoomMetricsProvider): void {
  rooms.set(roomId, provider);
}

export function unregisterRoom(roomId: string): void {
  rooms.delete(roomId);
}

// ── event-loop lag sampler ───────────────────────────────────────────────────
let lagMs = 0;
let lagMaxMs = 0;
{
  const INTERVAL = 500;
  let expected = performance.now() + INTERVAL;
  setInterval(() => {
    const now = performance.now();
    const lag = Math.max(0, now - expected);
    lagMs = lag;
    if (lag > lagMaxMs) lagMaxMs = lag;
    expected = now + INTERVAL;
  }, INTERVAL).unref();
}

let lastCpu = process.cpuUsage();
let lastCpuAt = performance.now();

export function snapshotMetrics(): object {
  const now = performance.now();
  const cpu = process.cpuUsage();
  const elapsedUs = (now - lastCpuAt) * 1000;
  const cpuPct = elapsedUs > 0
    ? Math.round(((cpu.user - lastCpu.user + cpu.system - lastCpu.system) / elapsedUs) * 100)
    : 0;
  lastCpu = cpu;
  lastCpuAt = now;

  const mem = process.memoryUsage();
  const roomList = [...rooms.values()].map((p) => p());

  return {
    uptimeSec: Math.round(process.uptime()),
    cpuPct,
    rssMb: Math.round(mem.rss / 1048576),
    heapUsedMb: Math.round(mem.heapUsed / 1048576),
    eventLoopLagMs: Number(lagMs.toFixed(1)),
    eventLoopLagMaxMs: Number(lagMaxMs.toFixed(1)),
    rooms: roomList,
    totals: {
      rooms: roomList.length,
      players: roomList.reduce((s, r) => s + r.players, 0),
      tickAvgMsMax: Math.max(0, ...roomList.map((r) => r.tickAvgMs)),
      tickMaxMsMax: Math.max(0, ...roomList.map((r) => r.tickMaxMs)),
    },
  };
}
