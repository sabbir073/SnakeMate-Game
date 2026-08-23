# API

## HTTP (via https://domain)

| Route | Method | Purpose |
|---|---|---|
| `/health` | GET | liveness: `{status, uptime, rooms, players}` |
| `/ready` | GET | readiness (503 while draining) |
| `/version` | GET | `{server, protocol, node}` |
| `/api/client-error` | POST | client error telemetry (rate-limited, 4 KB cap) |
| `/metrics` | GET | **internal only** (not proxied) — see MONITORING.md |

## Realtime (Colyseus over `/ws`)

Room `arena`, join options `{protocolVersion, nickname, skinId, channel?,
guestId?}` — mismatched protocolVersion is rejected with reason
`protocol_mismatch` + requiredProtocol (spec §87–88).

Messages (packages/protocol is the contract):
- C→S `i` InputMessage `{seq, angle, boost}` ≤30/s
- C→S `r` respawn request; `p` ping `{t}` (echoed)
- S→C `w` WelcomeMessage; `d` DeathMessage; `lb` LeaderboardMessage;
  `x` RejectMessage; `p` ping echo

State schema (AOI-filtered food): worms {id,nickname,skinId,x,y,angle,speed,
mass,boosting,alive,lastInputSeq,effects}, food {id,kind,x,y,value},
powerups {id,kind,x,y}, tick, worldSize.
