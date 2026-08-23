import type { IncomingMessage, ServerResponse } from "node:http";
import { PROTOCOL_VERSION } from "@nibblio/protocol";
import { snapshotMetrics } from "./metrics.js";
import { SERVER_VERSION } from "./version.js";

export interface HealthProviders {
  /** Rooms currently alive (for diagnostics). */
  roomCount(): number;
  playersOnline(): number;
  /** Readiness flag — false while draining for shutdown (spec §59/§73). */
  isReady(): boolean;
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

    default:
      return false; // let Colyseus/matchmaking handle it
  }
}
