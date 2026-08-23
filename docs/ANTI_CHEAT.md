# ANTI-CHEAT

## Threat model

Clients send ONLY input intentions `{seq, angle, boost}` (spec §28) and the
entire simulation is server-authoritative (game-core runs only on the server
for truth), so position/mass/score/kill forgery is structurally impossible.
The remaining surface, and the server response (src/anti-cheat.ts):

| Vector | Defense |
|---|---|
| Malformed payloads | shape-validated; dropped; strikes accumulate |
| Input flooding | 1 s sliding window, `VALIDATION.maxInputRate` (40/s) hard drop |
| Replay / seq regression | non-monotonic sequence numbers dropped |
| Sustained abuse | 30 strikes → 5 s mute (rate-drops do NOT strike) |
| Impossible mass jumps | `massGainAllowed` envelope (defense-in-depth) |
| Join flooding | per-IP matchmaking rate limit, 20/min (Redis-backed) |
| Pickup/collision cheats | n/a — resolved only by server sim from server state |

## Latency fairness (spec §54)

High ping is never punished: no timing-precision checks, jitter-buffer input
bursts don't strike, reconnect grace holds the worm. All rejection events are
logged (`input_rejections` on leave) for pattern review, not auto-bans.

## Tests

`apps/server/test/anti-cheat.test.ts` (8): shape rejection matrix, window
limits + recovery, replay rejection, mute + recovery, mass envelope.
