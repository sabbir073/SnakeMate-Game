#!/usr/bin/env bash
# Quality gate (spec §94): typecheck → unit tests → build → asset manifest.
# Any failure aborts. Run from repo root: pnpm gate
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── gate 1/4: typecheck ─────────────────────────────"
pnpm typecheck

echo "── gate 2/4: unit tests ────────────────────────────"
pnpm test

echo "── gate 3/4: build ─────────────────────────────────"
pnpm build

echo "── gate 4/4: asset manifest ────────────────────────"
pnpm asset:build

echo "✅ quality gate passed"
