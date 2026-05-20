#!/usr/bin/env bash
# Parallel launcher for one leg of the super-agent curve study. Spawns one
# `dispatch-super-leg.sh --trim <id>` background process per trim agent in
# the leg, so per-trim cells run sequentially within a process while trims
# run concurrently across processes — exactly parallelism = (#trims).
#
# Per-process cost cap defaults to MAX_TOTAL_COST_USD=30; per-cell cap is
# inherited from dispatch-super-leg.sh (VP_DEV_MAX_COST_USD=2.00). Worst
# case for a 6-trim leg: 6 × 30 = $180; expected ~$110 at $1.40/cell mean.
#
# Usage:
#   bash launch-leg-parallel.sh <leg-number 1..6> [--dry-print]

set -euo pipefail

LEG=""
DRY_PRINT=false
for arg in "$@"; do
  case "$arg" in
    --dry-print) DRY_PRINT=true;;
    *)
      if [[ -z "$LEG" ]]; then LEG="$arg"
      else echo "Unknown arg: $arg" >&2; exit 2
      fi
      ;;
  esac
done

if [[ -z "$LEG" || ! "$LEG" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 <leg-number> [--dry-print]" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
LEGS_JSON="$REPO_ROOT/research/curve-redo-data/super-agent/legs.json"
LEG_DIR="$REPO_ROOT/research/curve-redo-data/super-agent/leg${LEG}"
SPAWN_LOG_DIR="$LEG_DIR/spawner-logs"
mkdir -p "$SPAWN_LOG_DIR"

TRIM_IDS="$(node -e '
  const fs = require("node:fs");
  const j = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
  const target = Number(process.argv[2]);
  const leg = j.legs.find((L) => L.legNumber === target);
  if (!leg) { process.stderr.write(`ERROR: leg ${target} missing\n`); process.exit(3); }
  for (const id of leg.trimAgentIds) process.stdout.write(id + "\n");
' "$LEGS_JSON" "$LEG")"

if [[ -z "$TRIM_IDS" ]]; then
  echo "ERROR: no trims for leg=$LEG" >&2
  exit 2
fi

echo "[$(date -Iseconds)] launch-leg-parallel: leg=$LEG"
echo "  trims:"
while IFS= read -r tid; do
  [[ -z "$tid" ]] && continue
  echo "    - $tid"
done <<<"$TRIM_IDS"

DISPATCH="$REPO_ROOT/research/curve-redo-bundle/super-agent/dispatch-super-leg.sh"
PIDS=()

while IFS= read -r tid; do
  [[ -z "$tid" ]] && continue
  spawn_log="$SPAWN_LOG_DIR/${tid}.log"

  if $DRY_PRINT; then
    echo "  would spawn: bash $DISPATCH $LEG --trim $tid > $spawn_log 2>&1"
    continue
  fi

  echo "[$(date -Iseconds)] launching $tid → $spawn_log"
  MAX_TOTAL_COST_USD="${MAX_TOTAL_COST_USD:-30}" \
  VP_DEV_MAX_COST_USD="${VP_DEV_MAX_COST_USD:-2.00}" \
    bash "$DISPATCH" "$LEG" --trim "$tid" >"$spawn_log" 2>&1 &
  PIDS+=($!)
done <<<"$TRIM_IDS"

if $DRY_PRINT; then
  echo "[$(date -Iseconds)] dry-print only — no processes spawned."
  exit 0
fi

echo "[$(date -Iseconds)] ${#PIDS[@]} dispatch processes started; waiting..."
fail=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    echo "[$(date -Iseconds)] WARN: pid=$pid exited non-zero" >&2
    fail=$((fail+1))
  fi
done

echo "[$(date -Iseconds)] all dispatch processes finished. failed=$fail"

# Aggregate cost summary across all spawner logs.
total=$(awk '
  /running \$/ {
    n = split($0, parts, "running \\$")
    if (n >= 2) {
      gsub(/[^0-9.]/, "", parts[n])
      val[FILENAME] = parts[n] + 0
    }
  }
  END { sum = 0; for (k in val) sum += val[k]; printf "%.4f\n", sum }
' "$SPAWN_LOG_DIR"/*.log 2>/dev/null || echo "0")

echo "[$(date -Iseconds)] leg=$LEG aggregate cost \$$total"
exit $fail
