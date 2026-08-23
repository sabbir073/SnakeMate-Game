# CHANGELOG

All notable changes. Conventional-commit driven.

## [Unreleased]

### Added
- 2026-08-23 M2: product feel — powerups live end-to-end (SPEED/MAGNET/DOUBLE_GROWTH/SHIELD/BOOST_REDUCTION/SCORE_MULTIPLIER incl. magnet pull + shield block), full original art via procedural SVG pipeline (6 skins, 5 foods, 6 badges, wordmark/icon/favicon/social, bg tile) packed into an atlas, synthesized SFX + music with AudioManager, skin picker, settings modal (volumes/quality/reduced-motion), mobile joystick + boost button with safe areas, reconnect grace (server hold + client resume overlay), matchmaking channels. 30 game-core tests, 13 Playwright E2E.
- 2026-08-23 M1: playable multiplayer vertical slice — full deterministic simulation (food/growth, boost drops, collision → death → loot, spawn safety), client prediction + reconciliation, remote snapshot interpolation, DOM HUD (score/leaderboard/death screen), fakeLag network simulation, 45 unit tests + 9 Playwright E2E (two-client multiplayer, 150ms latency, death/respawn).
- 2026-08-23: repository bootstrap — monorepo skeleton, project rules (CLAUDE.md), master spec, docs structure.
