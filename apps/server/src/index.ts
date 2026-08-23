import { createServer } from "node:http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ARENA_ROOM } from "@nibblio/protocol";
import { logger } from "./logger.js";
import { handleHttp } from "./http.js";
import { ArenaRoom } from "./rooms/arena-room.js";
import { SERVER_VERSION } from "./version.js";

const PORT = Number(process.env.PORT ?? 2567);

let ready = true;

const httpServer = createServer((req, res) => {
  const handled = handleHttp(req, res, {
    roomCount: () => matchMaker.stats.local.roomCount,
    playersOnline: () => matchMaker.stats.local.ccu,
    isReady: () => ready,
  });
  if (!handled) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  }
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ARENA_ROOM, ArenaRoom);

// room/player accounting for /health
gameServer.onShutdown(() => {
  logger.info({ event: "shutdown_complete" }, "colyseus shutdown complete");
});

async function main(): Promise<void> {
  await gameServer.listen(PORT);
  logger.info(
    { event: "server_start", port: PORT, version: SERVER_VERSION },
    `nibblio server listening on :${PORT}`,
  );
}

// ── graceful shutdown (spec §73) ─────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info({ event: "shutdown_begin", signal }, "graceful shutdown starting");
  ready = false; // readiness fails first so the proxy stops routing new traffic
  try {
    await gameServer.gracefullyShutdown(false);
  } catch (err) {
    logger.error({ err }, "error during graceful shutdown");
  }
  httpServer.close();
  logger.info({ event: "shutdown_done" }, "bye");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason, event: "unhandled_rejection" }, "unhandled rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err, event: "uncaught_exception" }, "uncaught exception — exiting");
  process.exit(1);
});

void main();
