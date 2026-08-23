import { dbAvailable, getPool } from "./index.js";
import { logger } from "../logger.js";

/** Async batched persistence (spec §31, §91): gameplay results accumulate in
 *  memory and flush to PostgreSQL on an interval — the 60 Hz loop never waits
 *  on I/O. Losing ≤1 flush window of stats on a crash is the accepted
 *  trade-off for a realtime game. */

export interface MatchResultDelta {
  guestId: string;
  score: number;
  kills: number;
  survivedSec: number;
  rank: number;
  foodCollected: number;
  powerupsCollected: number;
  boostTimeSec: number;
  died: boolean;
}

const FLUSH_INTERVAL_MS = 10_000;

const queue: MatchResultDelta[] = [];
const profileTouches = new Map<string, { nickname: string; skinId: string }>();
let timer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

export function touchGuestProfile(guestId: string, nickname: string, skinId: string): void {
  if (!guestId) return;
  profileTouches.set(guestId, { nickname, skinId });
}

export function queueMatchResult(delta: MatchResultDelta): void {
  if (!delta.guestId) return;
  queue.push(delta);
  if (queue.length > 5000) queue.splice(0, queue.length - 5000); // hard bound
}

export function pendingCount(): number {
  return queue.length + profileTouches.size;
}

export function startPersistence(): void {
  if (timer) return;
  timer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
  timer.unref?.();
}

export async function stopPersistence(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await flush(); // final drain on graceful shutdown (spec §73)
}

export async function flush(): Promise<void> {
  if (flushing || !dbAvailable()) return;
  const pool = getPool();
  if (!pool) return;
  if (queue.length === 0 && profileTouches.size === 0) return;

  flushing = true;
  const results = queue.splice(0);
  const touches = [...profileTouches.entries()];
  profileTouches.clear();

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const [guestId, t] of touches) {
        await client.query(
          `INSERT INTO guest_profiles (guest_id, nickname, selected_skin)
           VALUES ($1, $2, $3)
           ON CONFLICT (guest_id) DO UPDATE
             SET nickname = $2, selected_skin = $3, last_seen_at = now()`,
          [guestId, t.nickname, t.skinId],
        );
      }

      for (const r of results) {
        // guarantee the FK target exists even if the touch was evicted
        await client.query(
          `INSERT INTO guest_profiles (guest_id) VALUES ($1)
           ON CONFLICT (guest_id) DO NOTHING`,
          [r.guestId],
        );
        await client.query(
          `INSERT INTO match_results (guest_id, score, kills, survived_sec, rank)
           VALUES ($1, $2, $3, $4, $5)`,
          [r.guestId, Math.floor(r.score), r.kills, Math.floor(r.survivedSec), r.rank],
        );
        await client.query(
          `INSERT INTO player_statistics AS ps
             (guest_id, total_games, total_kills, total_deaths, best_score,
              best_rank, longest_survival, food_collected, boost_time_sec,
              powerups_collected)
           VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (guest_id) DO UPDATE SET
             total_games = ps.total_games + 1,
             total_kills = ps.total_kills + $2,
             total_deaths = ps.total_deaths + $3,
             best_score = GREATEST(ps.best_score, $4),
             best_rank = LEAST(COALESCE(ps.best_rank, $5), $5),
             longest_survival = GREATEST(ps.longest_survival, $6),
             food_collected = ps.food_collected + $7,
             boost_time_sec = ps.boost_time_sec + $8,
             powerups_collected = ps.powerups_collected + $9,
             updated_at = now()`,
          [
            r.guestId, r.kills, r.died ? 1 : 0, Math.floor(r.score), r.rank,
            Math.floor(r.survivedSec), r.foodCollected, Math.floor(r.boostTimeSec),
            r.powerupsCollected,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    // failed batch is re-queued once (bounded) — spec §57: retry, never crash
    logger.error({ err: (err as Error).message, event: "persist_flush_failed" }, "stats flush failed");
    queue.unshift(...results.slice(0, 1000));
  } finally {
    flushing = false;
  }
}
