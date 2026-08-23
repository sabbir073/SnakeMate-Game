import { Client, Room } from "colyseus.js";
import { ARENA_ROOM, MSG, PROTOCOL_VERSION } from "@nibblio/protocol";
import type {
  DeathMessage, InputMessage, JoinOptions, LeaderboardMessage, WelcomeMessage,
} from "@nibblio/protocol";

/** Resolve the game server endpoint:
 *  1. VITE_SERVER_URL env override (staging/prod builds)
 *  2. same-origin /ws behind a reverse proxy (production default)
 *  3. dev fallback: same host, port 2567 */
export function serverEndpoint(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  if (import.meta.env.DEV) return `${proto}://${location.hostname}:2567`;
  return `${proto}://${location.host}/ws`;
}

export interface Connection {
  room: Room;
  welcome: WelcomeMessage;
  sendInput(input: InputMessage): void;
  onLeaderboard(cb: (msg: LeaderboardMessage) => void): void;
  onDeath(cb: (msg: DeathMessage) => void): void;
  requestRespawn(): void;
  leave(): Promise<void>;
  /** Resume the same session after an unexpected drop (spec §74).
   *  On success `room` points at the resumed room; re-register listeners. */
  reconnect(): Promise<void>;
}

export async function connect(nickname: string, skinId = "s0"): Promise<Connection> {
  const client = new Client(serverEndpoint());
  let channel = "main";
  let guestId = "";
  try {
    channel = new URLSearchParams(location.search).get("room") ?? "main";
    guestId = localStorage.getItem("nibblio.guestId") ?? "";
    if (!guestId) {
      guestId = crypto.randomUUID();
      localStorage.setItem("nibblio.guestId", guestId);
    }
  } catch { /* non-browser/private context — anonymous session */ }
  const options: JoinOptions = {
    protocolVersion: PROTOCOL_VERSION, nickname, skinId, channel, guestId,
  };
  const room = await client.joinOrCreate(ARENA_ROOM, options);

  const welcome = await new Promise<WelcomeMessage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("welcome timeout")), 8000);
    room.onMessage(MSG.welcome, (msg: WelcomeMessage) => {
      clearTimeout(timer);
      resolve(msg);
    });
    room.onMessage(MSG.reject, (msg: { reason: string }) => {
      clearTimeout(timer);
      reject(new Error(`server rejected join: ${msg.reason}`));
    });
    room.onError((code, message) => {
      clearTimeout(timer);
      reject(new Error(`room error ${code}: ${message ?? ""}`));
    });
  });

  const conn: Connection = {
    room,
    welcome,
    sendInput: (input) => conn.room.send(MSG.input, input),
    onLeaderboard: (cb) => conn.room.onMessage(MSG.leaderboard, cb),
    onDeath: (cb) => conn.room.onMessage(MSG.death, cb),
    requestRespawn: () => conn.room.send(MSG.respawn),
    leave: async () => {
      await conn.room.leave(true);
    },
    reconnect: async () => {
      const token = conn.room.reconnectionToken;
      conn.room = await client.reconnect(token);
    },
  };
  return conn;
}
