# DATABASE

PostgreSQL 16/17. OPTIONAL at runtime: without `DATABASE_URL` (or when
unreachable) the server logs a warning and runs memory-only — gameplay never
depends on the DB (ADR-005).

## Schema (spec §33)

`apps/server/migrations/*.sql`, applied in name order at server boot by
`src/db/index.ts` into a `schema_migrations` history table (applied files are
immutable; changes = new files). Tables: users, guest_profiles,
player_profiles, skins, skin_unlocks, matches, match_results (indexed by
guest+time), player_statistics, achievements, settings, purchases,
audit_events (indexed by time).

## Write path (spec §31, §91)

The 60 Hz loop NEVER performs I/O. `src/db/persistence.ts` accumulates
per-session results (score, kills, survival, food, powerups, boost time) and
profile touches in memory, flushing every 10 s in one transaction:
guest_profiles upsert → match_results insert → player_statistics upsert
(GREATEST/LEAST aggregation). Failed batches re-queue bounded; graceful
shutdown drains the queue (spec §73). Verified end-to-end against PostgreSQL
16 (2 guests → correct profiles/stats/match rows).

## Identity (spec §35)

Guest-first: the client generates a UUID once (localStorage) and sends it on
join; it keys all persistence. `guest_profiles.user_id` is the future account-
linking hook. No login is ever required to play.

## Operations

Backups/restore: docs/BACKUPS.md. Maintenance (vacuum/index review):
docs/OPERATIONS.md. Never edit schema manually in production (spec §69).
