#!/usr/bin/env bash
# Minimal ops monitor (spec §122, §124). Cron every 5 min:
#   */5 * * * * /path/to/repo/scripts/healthwatch.sh || <alert hook>
# Exits non-zero (→ cron mail / alert hook) on any failed check.
set -u
FAIL=0
check() { # name, command...
  local name="$1"; shift
  if "$@" > /dev/null 2>&1; then echo "[ok]   $name"; else echo "[FAIL] $name"; FAIL=1; fi
}
BASE="${BASE_URL:-http://localhost:8080}"
check "web/health"  curl -sf -m 5 "$BASE/health"
check "web/ready"   curl -sf -m 5 "$BASE/ready"
check "postgres"    docker compose exec -T postgres pg_isready -U nibblio -d nibblio
check "redis"       docker compose exec -T redis redis-cli ping

# disk thresholds (spec §124)
USE=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$USE" -ge 95 ]; then echo "[FAIL] disk ${USE}% (>=95)"; FAIL=1
elif [ "$USE" -ge 85 ]; then echo "[warn] disk ${USE}% (>=85)"
elif [ "$USE" -ge 70 ]; then echo "[note] disk ${USE}% (>=70)"
else echo "[ok]   disk ${USE}%"; fi
exit $FAIL
