/** ─── Nibblio realtime protocol ─────────────────────────────────────────────
 *  Versioned contract between client, server, and bots (spec §28, §86–88).
 *  Client sends INTENTIONS ONLY. Position/mass/score/kills are server-owned.
 */

export const PROTOCOL_VERSION = 1;

/** Colyseus room name for the main arena. */
export const ARENA_ROOM = "arena";

// ── message channels (Colyseus message types) ────────────────────────────────

export const MSG = {
  /** client → server: input intention */
  input: "i",
  /** client → server: respawn request after death */
  respawn: "r",
  /** server → client: full join acknowledgement */
  welcome: "w",
  /** server → client: death notice for the local player */
  death: "d",
  /** server → client: leaderboard update */
  leaderboard: "lb",
  /** server → client: protocol/version rejection before disconnect */
  reject: "x",
} as const;

// ── client → server ──────────────────────────────────────────────────────────

export interface InputMessage {
  /** Monotonic input sequence number (per session). */
  seq: number;
  /** Desired heading in radians, wrapped to (-π, π]. */
  angle: number;
  /** Boost intent. */
  boost: boolean;
}

export interface JoinOptions {
  protocolVersion: number;
  nickname: string;
  skinId: string;
  /** Reconnection token if resuming a session. */
  reconnectToken?: string;
  /** Matchmaking channel — rooms only match equal channels (default "main").
   *  Used by tests/dev for isolation; harmless in production. */
  channel?: string;
}

// ── server → client ──────────────────────────────────────────────────────────

export interface WelcomeMessage {
  playerId: string;
  protocolVersion: number;
  serverVersion: string;
  worldSize: number;
  tickRate: number;
  snapshotRate: number;
}

export interface DeathMessage {
  /** Nickname of the killer, or null for wall/self. */
  killedBy: string | null;
  score: number;
  mass: number;
  survivedSec: number;
  rank: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  skinId: string;
}

export interface LeaderboardMessage {
  top: LeaderboardEntry[];
  /** Local player's own rank (1-based) — may exceed top.length. */
  ownRank: number;
  totalPlayers: number;
}

export interface RejectMessage {
  reason: "protocol_mismatch" | "room_full" | "bad_input" | "rate_limited";
  detail?: string;
  requiredProtocol?: number;
}

// ── nickname rules (shared client/server validation) ─────────────────────────

export const NICKNAME_MAX = 16;

export function sanitizeNickname(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX)
    .trim();
  return cleaned.length > 0 ? cleaned : "Worm";
}
