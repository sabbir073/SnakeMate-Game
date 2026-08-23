# RELEASES

## Channels (spec §118)

development (branch `development`) → staging (compose staging overlay) →
production (tagged release on `main`).

## Release procedure

1. `pnpm gate` + `pnpm test:e2e` green on `development`.
2. `pnpm audit` review — document accepted advisories below.
3. Merge to `main`, tag `vX.Y.Z`, push.
4. Deploy per docs/DEPLOYMENT.md; verify health + WS smoke.
5. Update CHANGELOG.md.

Version surfaces: client footer (vX.Y.Z + protocol), GET /version, debug
panel (client + server + protocol). Protocol bumps (`PROTOCOL_VERSION`)
gate incompatible releases: old clients get a clean `protocol_mismatch`
reject and the reconnect UI asks for a refresh — never silent breakage
(spec §87–88).

## Release log

- **v0.1.0 (unreleased)** — M0–M4 development line; see CHANGELOG.md.
  Accepted advisories: none.
