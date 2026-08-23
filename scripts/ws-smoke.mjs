#!/usr/bin/env node
/** Production WS smoke test (spec §120, §94) — zero dependencies (Node 22+).
 *  1. POST matchmake reservation via the public endpoint
 *  2. open the reserved WebSocket and confirm the server accepts + speaks
 *  Usage: node scripts/ws-smoke.mjs wss://yourdomain.com/ws
 */
const endpoint = process.argv[2] ?? "ws://localhost:8080/ws";
const httpBase = endpoint.replace(/^ws/, "http");

function fail(msg) {
  console.error(`[ws-smoke] FAIL: ${msg}`);
  process.exit(1);
}

// 1. matchmaking reservation
const res = await fetch(`${httpBase}/matchmake/joinOrCreate/arena`, {
  method: "POST",
  headers: { accept: "application/json", "content-type": "application/json" },
  body: JSON.stringify({ protocolVersion: 1, nickname: "SmokeTest", skinId: "s0", channel: "smoke" }),
}).catch((e) => fail(`matchmake unreachable: ${e.message}`));
if (!res.ok) fail(`matchmake HTTP ${res.status}`);
const reservation = await res.json();
if (!reservation?.room?.roomId || !reservation?.sessionId) {
  fail(`unexpected matchmake payload: ${JSON.stringify(reservation).slice(0, 200)}`);
}
console.log(`[ws-smoke] seat reserved in room ${reservation.room.roomId}`);

// 2. connect the reserved seat
const wsUrl =
  `${endpoint}/${reservation.room.processId}/${reservation.room.roomId}` +
  `?sessionId=${reservation.sessionId}`;
const ws = new WebSocket(wsUrl);
const outcome = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve("timeout"), 8000);
  let gotData = false;
  ws.onmessage = () => {
    gotData = true;
    clearTimeout(timer);
    resolve("ok");
  };
  ws.onopen = () => {
    // Colyseus sends its handshake/state right after accept; wait for bytes
    setTimeout(() => {
      if (!gotData) {
        clearTimeout(timer);
        resolve("open-silent");
      }
    }, 4000);
  };
  ws.onerror = () => {
    clearTimeout(timer);
    resolve("error");
  };
  ws.onclose = (e) => {
    if (!gotData) {
      clearTimeout(timer);
      resolve(`closed-${e.code}`);
    }
  };
});
try { ws.close(); } catch { /* done */ }

if (outcome !== "ok") fail(`websocket ${outcome}`);
console.log("[ws-smoke] OK — matchmaking + websocket + room handshake all working");
process.exit(0);
