#!/usr/bin/env bash
# v3-parallel: drive score-cell-v3 over the cell manifest with bounded
# parallelism. Two-level locking prevents races when multiple v3-parallel
# instances or orphaned subshells target the same LOG_DIR/cell.
#
# Usage: v3-parallel.sh <manifest> <max-jobs>

set -u

MANIFEST=${1:-/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees/trim-complex7/scripts/cell-manifest.txt}
MAX_JOBS=${2:-2}

REPO_ROOT=/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees/trim-complex7
LOG_DIR=$REPO_ROOT/research/curve-redo-data/v2-scoring/trim-complex7/v3-logs
mkdir -p "$LOG_DIR"

# Singleton script lock — only one v3-parallel per LOG_DIR.
SCRIPT_LOCK="$LOG_DIR/.v3-parallel.lock"
exec 9>"$SCRIPT_LOCK"
if ! flock -n 9; then
  pid=$(cat "$SCRIPT_LOCK.pid" 2>/dev/null || echo "?")
  echo "FATAL: another v3-parallel.sh is running for this LOG_DIR (pid=$pid, lock=$SCRIPT_LOCK). Exiting." >&2
  exit 1
fi
echo $$ > "$SCRIPT_LOCK.pid"
trap 'rm -f "$SCRIPT_LOCK.pid"' EXIT

run_one() {
  local line=$1
  IFS='|' read -r CELL DIFF ISSUE TESTS OUT_V2 <<<"$line"
  local OUT_V3="${OUT_V2%-tests-v2.json}-tests-v3.json"

  # Fast skip pre-lock — avoid acquiring lock if already done.
  if [ -s "$OUT_V3" ]; then
    echo "SKIP $CELL (v3 already scored)"
    return 0
  fi

  # Per-cell lock — defends against the script-lock being bypassed
  # (e.g., manually invoked score-cell-v3.sh, orphaned subshells from prior
  # killed runs that re-spawned mid-cleanup).
  local CELL_LOCK="$LOG_DIR/.${CELL}.cell.lock"
  (
    exec 8>"$CELL_LOCK"
    if ! flock -n 8; then
      echo "SKIP $CELL (another worker holds cell lock; race avoided)"
      exit 0
    fi
    # Re-check after acquiring lock (another worker may have just finished).
    if [ -s "$OUT_V3" ]; then
      echo "SKIP $CELL (v3 scored by sibling while waiting for lock)"
      exit 0
    fi

    bash "$REPO_ROOT/scripts/score-cell-v3.sh" "$CELL" "$DIFF" "$ISSUE" "$TESTS" "$OUT_V3" \
      >>"$LOG_DIR/${CELL}.log" 2>&1

    if [ -s "$OUT_V3" ]; then
      local summary
      summary=$(node -e "const j=JSON.parse(require('fs').readFileSync('$OUT_V3','utf8')); console.log(j.passed+'/'+j.total, 'applyCleanly='+j.applyCleanly, 'status='+(j.applyStatus||'?'));")
      echo "DONE $CELL $summary"
    else
      echo "FAIL $CELL (no output; see $LOG_DIR/${CELL}.log)"
    fi
  )
  rm -f "$CELL_LOCK"
}

export -f run_one
export LOG_DIR REPO_ROOT

while IFS= read -r line; do
  [ -z "$line" ] && continue
  while (( $(jobs -rp | wc -l) >= MAX_JOBS )); do
    sleep 1
  done
  run_one "$line" &
done < "$MANIFEST"

wait
echo "ALL DONE"
