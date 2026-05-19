#!/usr/bin/env bash
# K=3 add-on for variance reduction at decision-boundary sizes.
#
# Dispatches replicates 2 and 3 of:
#   6 high-variance issues × 4 boundary sizes × 3 seeds = 72 cells per replicate
# Total: 144 added dispatch cells.
#
# Cap regime matches each cell's original leg ($2 / $4 / $6) so the K=2 / K=3
# samples are directly comparable to the K=1 samples already on disk.
# Distinct LOG_PREFIX (curveStudyR2- / curveStudyR3-) prevents collision with
# K=1 logs and the dispatch script's skip-if-exists check.
#
# Usage:
#   bash launch-k3-highvar.sh
#
# Resumes cleanly on re-run (per-cell skip on existing logs).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DISPATCH="$REPO_ROOT/research/curve-redo-bundle/super-agent/dispatch-super-leg.sh"
OUT_DIR="$REPO_ROOT/research/curve-redo-data/super-agent"

# (trim, leg, cap) tuples — 12 trims across 4 decision-boundary sizes.
TRIM_TUPLES=(
  "agent-super-trim-0-s19:1:2.00"
  "agent-super-trim-0-s1000022:1:2.00"
  "agent-super-trim-0-s2000025:1:2.00"
  "agent-super-trim-1633-s1652:2:2.00"
  "agent-super-trim-1633-s1001655:2:2.00"
  "agent-super-trim-1633-s2001658:2:2.00"
  "agent-super-trim-13065-s13084:4:4.00"
  "agent-super-trim-13065-s1013087:4:4.00"
  "agent-super-trim-13065-s2013090:4:4.00"
  "agent-super-trim-209042-s209061:6:6.00"
  "agent-super-trim-209042-s1209064:6:6.00"
  "agent-super-trim-209042-s2209067:6:6.00"
)

# 6 high-variance issues from the K=1 analysis.
ISSUES=(168 186 649 565 574 185)

dispatch_trim_replicate() {
  local tuple="$1" replicate="$2"
  local trim="${tuple%%:*}"
  local rest="${tuple#*:}"
  local leg="${rest%%:*}"
  local cap="${rest##*:}"
  local prefix="curveStudyR${replicate}-"
  local spawn_log="$OUT_DIR/leg${leg}/spawner-logs/${trim}-R${replicate}.log"
  mkdir -p "$OUT_DIR/leg${leg}/spawner-logs"

  for issue in "${ISSUES[@]}"; do
    LOG_PREFIX="$prefix" \
    VP_DEV_MAX_COST_USD="$cap" \
    MAX_TOTAL_COST_USD="30" \
      bash "$DISPATCH" "$leg" --trim "$trim" --issue "$issue" \
      >>"$spawn_log" 2>&1 || \
      echo "WARN: ${trim} issue=${issue} R=${replicate} exited non-zero" >&2
  done
}

for R in 2 3; do
  echo "[$(date -Iseconds)] === Replicate R=$R: 12 trims × 6 issues = 72 cells ==="
  PIDS=()
  for tuple in "${TRIM_TUPLES[@]}"; do
    dispatch_trim_replicate "$tuple" "$R" &
    PIDS+=($!)
  done
  for p in "${PIDS[@]}"; do wait "$p" || true; done
  echo "[$(date -Iseconds)] === Replicate R=$R complete ==="
done

echo "[$(date -Iseconds)] K=3 add-on complete. Run score-super-leg.sh for legs 1/2/4/6, then aggregate."
