import type { IncomingMessage, ServerResponse } from "node:http";
import { PROTOCOL_VERSION } from "@nibblio/protocol";
import { dbAvailable, getPool } from "./db/index.js";
import { logger } from "./logger.js";
import { snapshotMetrics } from "./metrics.js";
import { rateLimit } from "./rate-limit.js";
import { SERVER_VERSION } from "./version.js";

export interface HealthProviders {
  /** Rooms currently alive (for diagnostics). */
  roomCount(): number;
  playersOnline(): number;
  /** Readiness flag — false while draining for shutdown (spec §59/§73). */
  isReady(): boolean;
}

// global top-10 (humans only — bots never persist), cached 30 s
interface GlobalEntry { name: string; score: number; skin: string }
let lbCache: { at: number; entries: GlobalEntry[] } = { at: 0, entries: [] };

async function globalLeaderboard(): Promise<GlobalEntry[]> {
  const now = Date.now();
  if (now - lbCache.at < 30_000) return lbCache.entries;
  lbCache = { at: now, entries: [] };
  const pool = getPool();
  if (!dbAvailable() || !pool) return lbCache.entries;
  try {
    const res = await pool.query(
      `SELECT g.nickname AS name, s.best_score AS score, g.selected_skin AS skin
       FROM player_statistics s
       JOIN guest_profiles g ON g.guest_id = s.guest_id
       WHERE s.best_score > 0
       ORDER BY s.best_score DESC
       LIMIT 10`,
    );
    lbCache.entries = res.rows.map((r: { name: string; score: string | number; skin: string }) => ({
      name: String(r.name).slice(0, 16),
      score: Number(r.score),
      skin: String(r.skin),
    }));
  } catch (err) {
    logger.warn({ err: (err as Error).message, event: "global_lb_failed" }, "leaderboard query failed");
  }
  return lbCache.entries;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(payload);
}

/** Minimal dependency-free HTTP API (spec §34, §59). Attached to the same
 *  http server Colyseus uses, so one port serves WS + HTTP. */
export function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  providers: HealthProviders,
): boolean {
  const url = (req.url ?? "/").split("?")[0];

  switch (url) {
    case "/health":
      json(res, 200, {
        status: "ok",
        uptime: Math.round(process.uptime()),
        rooms: providers.roomCount(),
        players: providers.playersOnline(),
      });
      return true;

    case "/ready":
      if (providers.isReady()) json(res, 200, { ready: true });
      else json(res, 503, { ready: false });
      return true;

    case "/version":
      json(res, 200, {
        server: SERVER_VERSION,
        protocol: PROTOCOL_VERSION,
        node: process.version,
      });
      return true;

    case "/metrics":
      json(res, 200, snapshotMetrics());
      return true;

    case "/api/leaderboard":
      void globalLeaderboard().then((entries) => json(res, 200, { entries }));
      return true;

    case "/api/client-error": {
      if (req.method !== "POST") {
        json(res, 405, { error: "method_not_allowed" });
        return true;
      }
      const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        ?? req.socket.remoteAddress ?? "unknown";
      void (async () => {
        if (!(await rateLimit(`cerr:${ip}`, 10, 60))) {
          json(res, 429, { error: "rate_limited" });
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          if (body.length < 4096) body += chunk.toString("utf8");
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body) as Record<string, unknown>;
            logger.warn(
              {
                event: "client_error",
                message: String(payload.message ?? "").slice(0, 300),
                source: String(payload.source ?? "").slice(0, 200),
                clientVersion: String(payload.version ?? "").slice(0, 40),
                ua: String(payload.ua ?? "").slice(0, 200),
              },
              "client-side error reported",
            );
          } catch { /* malformed — ignore */ }
          json(res, 200, { ok: true });
        });
      })();
      return true;
    }

    default:
      return false; // let Colyseus/matchmaking handle it
  }
}
