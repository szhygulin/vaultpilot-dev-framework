#!/usr/bin/env bash
# Parallel variant of dispatch-specialist-redo.sh.
#
# Why a separate script: parallel-mode requires N pre-created scratch clones
# (one per parallel slot) because concurrent `git worktree add` against a
# shared `.git/config` races on the config-file lock and fails. Pre-created
# clones isolate the `.git/` dirs; cells distribute round-robin and run
# concurrently with no contention. The serial dispatcher
# (dispatch-specialist-redo.sh) is preserved unchanged for repeatability.
#
# Behavior matches the serial dispatcher cell-for-cell:
#   * --dry-run, --no-target-claude-md, --skip-summary, --capture-diff-path
#   * --replay-base-sha + --allow-closed-issue + --issue-body-only for closed
#     leg-2 issues
#   * --model claude-sonnet-4-6 (override via $MODEL)
#   * skip-if-exists per cell (idempotent restart)
#
# Origin re-add workaround built in: #253 (applyReplayRollback strips the
# shared `origin` remote) requires re-adding origin before each cell so
# subsequent cells' `git fetch origin main` calls don't fail.
#
# Usage:
#   SCRATCH_CLONES_DIR=<path> \
#     bash dispatch-specialist-redo-parallel.sh <leg> --parallel <N> [--dry-print]
#     <leg>          1 or 2
#     --parallel <N> number of parallel slots (must equal scratch-clone count)
#     --dry-print    print the spawn commands without executing
#
# Required env:
#   SCRATCH_CLONES_DIR=<path>  Directory containing N scratch clones per
#                              target repo: <path>/<repo-name>-1/, -2/, ...
#                              Create via prepare-scratch-clones.sh.
#
# Cost defense in depth (per-cell, not aggregate; the parallel running-total
# is best-effort because workers update independently):
#   * VP_DEV_MAX_COST_USD per cell (default 10)
#   * Per-worker logs at $OUT_DIR/parallel-worker-<i>.log

set -euo pipefail

LEG="${1:-}"
shift || true
PARALLEL=1
DRY_PRINT=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --parallel)   PARALLEL="$2"; shift 2 ;;
    --dry-print)  DRY_PRINT=true; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ "$LEG" != "1" && "$LEG" != "2" ]]; then
  echo "Usage: $0 <1|2> --parallel <N> [--dry-print]" >&2
  exit 2
fi
if ! [[ "$PARALLEL" =~ ^[0-9]+$ ]] || [[ "$PARALLEL" -lt 1 ]]; then
  echo "ERROR: --parallel must be a positive integer (got: $PARALLEL)" >&2
  exit 2
fi
if [[ -z "${SCRATCH_CLONES_DIR:-}" ]]; then
  echo "ERROR: SCRATCH_CLONES_DIR env var is required (run prepare-scratch-clones.sh first)." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/research/curve-redo-data/specialist-redo}"
CORPUS="$REPO_ROOT/research/curve-redo-bundle/corpus.json"
PICKS="$OUT_DIR/picks.tsv"
LOGS_DIR="$OUT_DIR/logs-leg${LEG}"
DIFFS_DIR="$OUT_DIR/diffs-leg${LEG}"

REPLICATES="${REPLICATES:-3}"
MODEL="${MODEL:-claude-sonnet-4-6}"
export VP_DEV_MAX_COST_USD="${VP_DEV_MAX_COST_USD:-10}"

[[ -f "$PICKS" ]]  || { echo "ERROR: picks.tsv not found at $PICKS." >&2; exit 2; }
[[ -f "$CORPUS" ]] || { echo "ERROR: corpus.json not found at $CORPUS." >&2; exit 2; }

mkdir -p "$LOGS_DIR" "$DIFFS_DIR"

echo "[$(date -Iseconds)] dispatch-specialist-redo-parallel: leg=$LEG parallel=$PARALLEL K=$REPLICATES" >&2
echo "  scratch_clones_dir=$SCRATCH_CLONES_DIR" >&2
echo "  out_dir=$OUT_DIR" >&2

# Parse corpus → per-issue {repo,state,baseSha}.
declare -A ISSUE_REPO ISSUE_STATE ISSUE_SHA
while IFS=$'\t' read -r issueId repo state cls sha; do
  ISSUE_REPO["$issueId"]="$repo"
  ISSUE_STATE["$issueId"]="$state"
  ISSUE_SHA["$issueId"]="$sha"
done < <(node -e '
  const fs = require("node:fs");
  const c = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
  const leg = Number(process.argv[2]);
  for (const i of c.issues) {
    if (Number(i.leg) !== leg) continue;
    process.stdout.write([i.issueId, i.repo, i.state||"open", i.decisionClass||"", i.baseSha||""].join("\t")+"\n");
  }
' "$CORPUS" "$LEG")

# Read picks → issueId→agentId.
declare -A PICKED
while IFS=$'\t' read -r issueId agentId rationale score pickedLeg labels; do
  [[ "$issueId" == "issueId" ]] && continue
  [[ -z "$agentId" || "$agentId" == "fresh-mint" ]] && continue
  if [[ "$agentId" =~ ^agent-916a-trim- ]]; then
    echo "ERROR: trim agent $agentId leaked into picks." >&2
    exit 4
  fi
  PICKED["$issueId"]="$agentId"
done <"$PICKS"

# Resolve a scratch clone path for (repo, slot). Asserts the clone exists.
scratch_clone_for_slot() {
  local repo="$1" slot="$2"
  local name="${repo##*/}"
  local p="$SCRATCH_CLONES_DIR/${name}-${slot}"
  if [[ ! -d "$p/.git" ]]; then
    echo "ERROR: no scratch clone for $repo at $p (slot $slot)." >&2
    echo "  run: bash prepare-scratch-clones.sh $repo $PARALLEL $SCRATCH_CLONES_DIR" >&2
    return 1
  fi
  echo "$p"
}

# Build the flat cell list: one entry per (issue, replicate) preserving the
# corpus order so failure-mode debugging matches the serial dispatcher.
ALL_CELLS=()
for issueId in "${!ISSUE_REPO[@]}"; do :; done  # ensure assoc array iteration available
# Iterate in corpus order — bash assoc arrays don't preserve insertion order,
# so re-read from corpus.json directly.
while IFS=$'\t' read -r issueId _ _ _ _; do
  agent="${PICKED[$issueId]:-}"
  [[ -z "$agent" ]] && continue
  for r in $(seq 1 "$REPLICATES"); do
    ALL_CELLS+=("$issueId|$agent|$r")
  done
done < <(node -e '
  const fs = require("node:fs");
  const c = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
  const leg = Number(process.argv[2]);
  for (const i of c.issues) {
    if (Number(i.leg) !== leg) continue;
    process.stdout.write([i.issueId, i.repo, i.state||"open", i.decisionClass||"", i.baseSha||""].join("\t")+"\n");
  }
' "$CORPUS" "$LEG")

CELL_COUNT="${#ALL_CELLS[@]}"
echo "  cells=$CELL_COUNT, slots=$PARALLEL → ~$(( (CELL_COUNT + PARALLEL - 1) / PARALLEL )) cells per slot" >&2

# Pre-flight: assert all required scratch clones exist (one per repo per slot).
declare -A NEEDED_REPOS
for entry in "${ALL_CELLS[@]}"; do
  IFS='|' read -r issueId _ _ <<<"$entry"
  NEEDED_REPOS["${ISSUE_REPO[$issueId]}"]=1
done
for repo in "${!NEEDED_REPOS[@]}"; do
  for slot in $(seq 1 "$PARALLEL"); do
    if ! scratch_clone_for_slot "$repo" "$slot" >/dev/null; then exit 5; fi
  done
done

# Run a single cell against a specific scratch clone. Idempotent origin re-add
# (workaround for #253) before each cell so replay-rollback's strip doesn't
# break subsequent cells.
run_cell() {
  local issueId="$1" agent="$2" r="$3" clone="$4"
  local repo="${ISSUE_REPO[$issueId]}"
  local state="${ISSUE_STATE[$issueId]}"
  local sha="${ISSUE_SHA[$issueId]}"
  local cell_id="bench-r${r}-${agent}-${issueId}"
  local log_path="$LOGS_DIR/${cell_id}.log"
  local diff_path="$DIFFS_DIR/${cell_id}.diff"

  if [[ -s "$log_path" ]]; then
    echo "[$(date -Iseconds)] skip (exists): $cell_id" >&2
    return 0
  fi

  # Workaround for #253 — replay-rollback strips origin from the shared
  # .git/config; re-add idempotently before each cell.
  git -C "$clone" remote get-url origin >/dev/null 2>&1 || \
    git -C "$clone" remote add origin "https://github.com/$repo" 2>/dev/null || true

  local cmd=(npm run vp-dev -- spawn
    --agent "$agent"
    --issue "$issueId"
    --target-repo "$repo"
    --target-repo-path "$clone"
    --dry-run
    --no-target-claude-md
    --skip-summary
    --model "$MODEL"
    --capture-diff-path "$diff_path")
  if [[ "$state" == "closed" ]]; then
    cmd+=(--allow-closed-issue --issue-body-only)
    [[ -n "$sha" ]] && cmd+=(--replay-base-sha "$sha")
  fi

  echo "[$(date -Iseconds)] start $cell_id (clone=$clone)" >&2
  if $DRY_PRINT; then
    printf '  '; printf '%q ' "${cmd[@]}"; echo
    return 0
  fi
  if ! (cd "$REPO_ROOT" && "${cmd[@]}") >"$log_path" 2>&1; then
    echo "[$(date -Iseconds)] WARN: spawn non-zero — log at $log_path" >&2
  fi
  local cost
  cost=$(grep -oE '"costUsd"[^0-9.]*[0-9.]+' "$log_path" 2>/dev/null | grep -oE '[0-9.]+' | head -1 || echo 0)
  echo "[$(date -Iseconds)] done  $cell_id cost=\$${cost:-0}" >&2
}

# Worker function — runs cells assigned to this slot serially.
run_slot() {
  local slot="$1"
  shift
  local entries=("$@")
  for entry in "${entries[@]}"; do
    IFS='|' read -r issueId agent r <<<"$entry"
    local repo="${ISSUE_REPO[$issueId]}"
    local clone
    clone="$(scratch_clone_for_slot "$repo" "$slot")" || exit 5
    run_cell "$issueId" "$agent" "$r" "$clone"
  done
}

# Distribute cells round-robin across slots (1..PARALLEL).
declare -a SLOT_CELLS
for i in $(seq 1 "$PARALLEL"); do SLOT_CELLS[$i]=""; done
idx=0
for entry in "${ALL_CELLS[@]}"; do
  slot=$(( (idx % PARALLEL) + 1 ))
  if [[ -z "${SLOT_CELLS[$slot]:-}" ]]; then
    SLOT_CELLS[$slot]="$entry"
  else
    SLOT_CELLS[$slot]="${SLOT_CELLS[$slot]}"$'\n'"$entry"
  fi
  idx=$((idx + 1))
done

# Fork one worker per slot; per-worker stderr → parallel-worker-<i>.log.
PIDS=()
for slot in $(seq 1 "$PARALLEL"); do
  worker_log="$OUT_DIR/parallel-worker-${slot}.log"
  rm -f "$worker_log"
  if [[ -z "${SLOT_CELLS[$slot]:-}" ]]; then
    echo "[$(date -Iseconds)] slot $slot: no cells assigned" >&2
    continue
  fi
  cell_count=$(echo "${SLOT_CELLS[$slot]}" | wc -l | awk '{print $1}')
  echo "[$(date -Iseconds)] slot $slot: dispatching $cell_count cell(s) → $worker_log" >&2
  # Build entries array via mapfile, pass to run_slot.
  (
    mapfile -t entries <<<"${SLOT_CELLS[$slot]}"
    run_slot "$slot" "${entries[@]}"
  ) >"$worker_log" 2>&1 &
  PIDS+=($!)
done

# Wait for all workers; collect exit codes.
fail=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    fail=$((fail + 1))
  fi
done

echo "[$(date -Iseconds)] dispatch-specialist-redo-parallel: leg=$LEG complete. workers=${#PIDS[@]} failed=$fail" >&2
[[ $fail -eq 0 ]]
