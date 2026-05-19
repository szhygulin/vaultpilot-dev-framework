#!/usr/bin/env bash
# Super-agent random-trim dispatch — Phase C of
# feature-plans/super-agent-curve-experiment-plan.md.
#
# For one leg (1..6) read from research/curve-redo-data/super-agent/legs.json,
# spawns one cell per (trim agent × corpus issue × K=1). Each cell:
#   * runs in --dry-run mode (intercepts push/PR side effects)
#   * suppresses the live target-repo CLAUDE.md (--no-target-claude-md) so
#     the effective context = trim agent's per-agent CLAUDE.md only
#   * captures the post-run diff via --capture-diff-path so the scorer's
#     run-tests can apply it
#   * passes --skip-summary so the agent's CLAUDE.md doesn't drift across cells
#   * passes --research-mode so registry side effects (counters, lastActiveAt,
#     lesson appends) are suppressed across the experiment
#   * uses claude-sonnet-4-6 to match the curve-redo trim baseline
#   * (closed leg-2 issues only) rolls the worktree to baseSha via
#     --replay-base-sha and forwards --allow-closed-issue + --issue-body-only
#
# Cells run serially within an agent (per-agent worktree race protection)
# but sequentially across agents in this script. The leg structure already
# bounds wall-time per leg; cross-agent parallelism would need a per-agent
# scratch clone setup the operator may or may not have prepared.
#
# Usage:
#   bash dispatch-super-leg.sh <leg-number 1..N> [--dry-print] [--issue <issueId>] [--trim <agentId>]
#     <leg-number>   1..N where N = legs.json:legCount
#     --dry-print    print the spawn commands without executing
#     --issue <id>   only dispatch cells against this issue (smoke-test path)
#     --trim <id>    only dispatch this trim agent's cells (smoke-test path)
#
# Required environment / file layout (relative to repo root):
#   research/curve-redo-bundle/corpus.json               — 13-issue corpus
#   research/curve-redo-data/super-agent/legs.json       — written by build-super-trims.cjs
#   $OUT_DIR/leg<N>/logs/                                — created
#   $OUT_DIR/leg<N>/diffs/                               — created
#
# Cost defense in depth:
#   * VP_DEV_MAX_COST_USD per cell (caller-overridable, default 2.00)
#   * MAX_TOTAL_COST_USD per leg (caller-overridable, default 130);
#     dispatch aborts when the rolling sum (parsed from each cell's envelope
#     JSON) exceeds the cap.

set -euo pipefail

LEG=""
DRY_PRINT=false
FILTER_ISSUE=""
FILTER_TRIM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-print) DRY_PRINT=true; shift;;
    --issue)     FILTER_ISSUE="$2"; shift 2;;
    --trim)      FILTER_TRIM="$2"; shift 2;;
    -h|--help)
      sed -n '2,30p' "$0" >&2
      exit 0
      ;;
    *)
      if [[ -z "$LEG" ]]; then LEG="$1"; shift
      else echo "Unknown arg: $1" >&2; exit 2
      fi
      ;;
  esac
done

if [[ -z "$LEG" || ! "$LEG" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 <leg-number> [--dry-print] [--issue <id>] [--trim <agentId>]" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
LEGS_JSON="${LEGS_JSON:-$REPO_ROOT/research/curve-redo-data/super-agent/legs.json}"
CORPUS="${CORPUS:-$REPO_ROOT/research/curve-redo-bundle/corpus.json}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/research/curve-redo-data/super-agent}"
LEG_DIR="$OUT_DIR/leg${LEG}"
LOGS_DIR="$LEG_DIR/logs"
DIFFS_DIR="$LEG_DIR/diffs"

MODEL="${MODEL:-claude-sonnet-4-6}"
LOG_PREFIX="${LOG_PREFIX:-curveStudy-}"
MAX_TOTAL_COST_USD="${MAX_TOTAL_COST_USD:-130}"
export VP_DEV_MAX_COST_USD="${VP_DEV_MAX_COST_USD:-2.00}"

if [[ ! -f "$LEGS_JSON" ]]; then
  echo "ERROR: legs.json missing at $LEGS_JSON — run build-super-trims.cjs first." >&2
  exit 2
fi
if [[ ! -f "$CORPUS" ]]; then
  echo "ERROR: corpus.json missing at $CORPUS." >&2
  exit 2
fi

mkdir -p "$LOGS_DIR" "$DIFFS_DIR"

echo "[$(date -Iseconds)] dispatch-super-leg: leg=$LEG model=$MODEL" >&2
echo "  legs.json=$LEGS_JSON" >&2
echo "  out_dir=$LEG_DIR" >&2
echo "  per-cell cap=\$$VP_DEV_MAX_COST_USD; leg cap=\$$MAX_TOTAL_COST_USD" >&2

# Resolve the trim agentIds for this leg (from legs.json).
LEG_TRIM_LINES="$(node -e '
  const fs = require("node:fs");
  const j = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
  const target = Number(process.argv[2]);
  const leg = j.legs.find((L) => L.legNumber === target);
  if (!leg) { process.stderr.write(`ERROR: leg ${target} missing\n`); process.exit(3); }
  for (const id of leg.trimAgentIds) {
    const t = j.trims.find((T) => T.agentId === id);
    const sizeBytes = t ? t.sizeBytes : 0;
    const seed = t ? t.seed : 0;
    const clones = t ? Object.entries(t.clones).map(([k,v]) => `${k}=${v}`).join(",") : "";
    process.stdout.write([id, sizeBytes, seed, clones].join("\t") + "\n");
  }
' "$LEGS_JSON" "$LEG")"

if [[ -z "$LEG_TRIM_LINES" ]]; then
  echo "ERROR: no trim agents resolved for leg=$LEG." >&2
  exit 2
fi

# Parse corpus once via node — bash JSON is a footgun.
CORPUS_TSV="$(node -e '
  const fs = require("node:fs");
  const c = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
  for (const i of c.issues) {
    const sha = i.baseSha || "";
    const state = i.state || "open";
    process.stdout.write([i.issueId, i.repo, state, sha].join("\t") + "\n");
  }
' "$CORPUS")"

declare -A ISSUE_REPO ISSUE_STATE ISSUE_SHA
ALL_ISSUE_IDS=()
while IFS=$'\t' read -r issueId repo state sha; do
  [[ -z "$issueId" ]] && continue
  ISSUE_REPO["$issueId"]="$repo"
  ISSUE_STATE["$issueId"]="$state"
  ISSUE_SHA["$issueId"]="$sha"
  ALL_ISSUE_IDS+=("$issueId")
done <<<"$CORPUS_TSV"

# Optionally filter to a single issue (smoke-test path).
if [[ -n "$FILTER_ISSUE" ]]; then
  if [[ -z "${ISSUE_REPO[$FILTER_ISSUE]:-}" ]]; then
    echo "ERROR: --issue $FILTER_ISSUE not in corpus." >&2
    exit 2
  fi
  ISSUE_IDS=("$FILTER_ISSUE")
else
  ISSUE_IDS=("${ALL_ISSUE_IDS[@]}")
fi

# Resolve a target-repo source clone the spawn can read from. Per-cell uses
# this as --target-repo-path. Mirrors `resolveTargetRepoPath` (#254): default
# to $HOME/dev/<name>, fall back to $HOME/dev/vaultpilot/<name>.
resolve_clone_for_repo() {
  local repo="$1" name agentId="${2:-}"
  name="${repo##*/}"
  # Prefer the per-agent scratch clone build-super-trims.cjs prepared.
  if [[ -n "$agentId" ]]; then
    local scratch="/tmp/study-clones/${agentId}-${name}"
    if [[ -d "$scratch/.git" ]]; then echo "$scratch"; return 0; fi
  fi
  local candidate
  for candidate in "${HOME:-/home}/dev/$name" "${HOME:-/home}/dev/vaultpilot/$name"; do
    if [[ -d "$candidate/.git" ]]; then echo "$candidate"; return 0; fi
  done
  echo "ERROR: no clone for $repo at /tmp/study-clones/${agentId}-${name} nor under \$HOME/dev/. Run build-super-trims.cjs to pre-create scratch clones." >&2
  return 1
}

# Cost extractor — same shape as dispatch-specialist-redo.sh.
extract_cost() {
  python3 -c '
import json, sys, re
text = open(sys.argv[1]).read()
m = re.search(r"\"costUsd\"\s*:\s*([0-9.]+)", text)
print(m.group(1) if m else "0")
' "$1" 2>/dev/null || echo 0
}

# Build trim list (TSV: agentId\tsizeBytes\tseed). Filter to --trim if set.
TRIMS=()
while IFS=$'\t' read -r agentId sizeBytes seed clones; do
  [[ -z "$agentId" ]] && continue
  if [[ -n "$FILTER_TRIM" && "$agentId" != "$FILTER_TRIM" ]]; then continue; fi
  TRIMS+=("$agentId")
done <<<"$LEG_TRIM_LINES"

if [[ ${#TRIMS[@]} -eq 0 ]]; then
  echo "ERROR: no trims selected (filter --trim '$FILTER_TRIM' may not be in leg=$LEG)." >&2
  exit 2
fi

cell_count=$((${#TRIMS[@]} * ${#ISSUE_IDS[@]}))
echo "  trims: ${#TRIMS[@]}; issues: ${#ISSUE_IDS[@]}; cells: $cell_count" >&2

total_cost=0
cells_done=0

for agentId in "${TRIMS[@]}"; do
  for issueId in "${ISSUE_IDS[@]}"; do
    repo="${ISSUE_REPO[$issueId]}"
    state="${ISSUE_STATE[$issueId]}"
    sha="${ISSUE_SHA[$issueId]}"

    if ! clone="$(resolve_clone_for_repo "$repo" "$agentId")"; then
      exit 5
    fi

    # The aggregator uses a regex of `^${prefix}(agent-[a-z0-9-]+)-(\d+)\.log$`,
    # so the log filename must be exactly `<prefix><agentId>-<issueId>.log`.
    cell_id="${LOG_PREFIX}${agentId}-${issueId}"
    log_path="$LOGS_DIR/${cell_id}.log"
    diff_path="$DIFFS_DIR/${cell_id}.diff"

    cells_done=$((cells_done + 1))
    if [[ -s "$log_path" ]]; then
      echo "[$(date -Iseconds)] [$cells_done/$cell_count] skip (already exists): $cell_id" >&2
      continue
    fi

    if (( $(echo "$total_cost >= $MAX_TOTAL_COST_USD" | bc -l) )); then
      echo "[$(date -Iseconds)] BUDGET EXHAUSTED at \$$total_cost — aborting." >&2
      exit 3
    fi

    cmd=(npm run vp-dev -- spawn
      --agent "$agentId"
      --issue "$issueId"
      --target-repo "$repo"
      --target-repo-path "$clone"
      --dry-run
      --no-target-claude-md
      --skip-summary
      --research-mode
      --model "$MODEL"
      --capture-diff-path "$diff_path")

    if [[ "$state" == "closed" ]]; then
      cmd+=(--allow-closed-issue --issue-body-only)
      if [[ -n "$sha" ]]; then
        cmd+=(--replay-base-sha "$sha")
      fi
    fi

    echo "[$(date -Iseconds)] [$cells_done/$cell_count] $cell_id (clone=$clone)" >&2
    if $DRY_PRINT; then
      printf '  '; printf '%q ' "${cmd[@]}"; echo
      continue
    fi

    if ! (cd "$REPO_ROOT" && "${cmd[@]}") >"$log_path" 2>&1; then
      echo "  WARN: spawn exited non-zero — log preserved at $log_path" >&2
    fi
    delta="$(extract_cost "$log_path")"
    total_cost="$(echo "$total_cost + $delta" | bc -l)"
    echo "  cost: +\$$delta (running \$$total_cost)" >&2
  done
done

echo "[$(date -Iseconds)] dispatch-super-leg: leg=$LEG complete. cells=$cells_done total_cost=\$$total_cost" >&2
