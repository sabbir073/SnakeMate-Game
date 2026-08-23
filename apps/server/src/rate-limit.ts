import { Redis } from "ioredis";
import { logger } from "./logger.js";

/** Rate limiting (spec §56): Redis-backed sliding-window counters so limits
 *  hold across instances; automatic in-memory fallback when Redis is absent
 *  (single-instance dev). */

let redis: Redis | null = null;
let available = false;

export function redisAvailable(): boolean {
  return available;
}

export async function initRedis(): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn({ event: "redis_disabled" }, "REDIS_URL not set — in-memory rate limits");
    return false;
  }
  try {
    redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    redis.on("error", (err) => {
      if (available) logger.error({ err: err.message, event: "redis_error" }, "redis error");
      available = false;
    });
    redis.on("ready", () => {
      available = true;
    });
    await redis.connect();
    await redis.ping();
    available = true;
    logger.info({ event: "redis_ready" }, "redis connected");
    return true;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, event: "redis_unreachable" },
      "redis unreachable — in-memory rate limits",
    );
    redis?.disconnect();
    redis = null;
    available = false;
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await redis?.quit().catch(() => undefined);
  redis = null;
  available = false;
}

// in-memory fallback windows
const memory = new Map<string, { count: number; resetAt: number }>();

/** Returns true when the action is ALLOWED for `key` (≤ limit per windowSec). */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  if (available && redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, windowSec);
      return count <= limit;
    } catch {
      // fall through to memory on transient redis failure
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now >= entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  entry.count++;
  if (memory.size > 10_000) {
    // bound the fallback map
    for (const [k, v] of memory) {
      if (now >= v.resetAt) memory.delete(k);
    }
  }
  return entry.count <= limit;
}
