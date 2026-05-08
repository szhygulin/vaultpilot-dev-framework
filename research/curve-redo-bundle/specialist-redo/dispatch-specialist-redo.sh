#!/usr/bin/env bash
# Curve-redo follow-up — Step 6 of feature-plans/curve-redo-specialist-followup-plan.md.
#
# For each (issueId, agentId) row in picks.tsv that matches the requested leg,
# spawns K replicate cells via `vp-dev spawn`. Each cell:
#   * runs in --dry-run mode (intercepts push/PR)
#   * suppresses the live target-repo CLAUDE.md (--no-target-claude-md) so the
#     effective context = picked agent's per-agent CLAUDE.md only — same
#     isolation contract as leg-1 of curve-redo
#   * captures the post-run diff via --capture-diff-path so the scorer's
#     testRunner can apply it
#   * passes --skip-summary so the agent's CLAUDE.md doesn't drift across
#     replicates
#   * uses claude-sonnet-4-6 to match the merged trim baseline's tier
#   * (closed leg-2 issues only) rolls the worktree to baseSha via
#     --replay-base-sha and forwards --allow-closed-issue + --issue-body-only
#
# Cells run serially. The 2026-05-07 picker dry-run collapsed all 13 issues to
# a single agent, so cross-agent parallelism was zero-benefit anyway. Adding
# parallelism is an operator follow-up if/when the picker distribution changes.
#
# Usage:
#   bash dispatch-specialist-redo.sh <leg> [--dry-print]
#     <leg>          1 or 2
#     --dry-print    print the spawn commands without executing
#
# Required environment / file layout (relative to repo root):
#   research/curve-redo-bundle/corpus.json
#   $OUT_DIR/picks.tsv                          (default OUT_DIR=research/curve-redo-data/specialist-redo)
#   $OUT_DIR/logs-leg<leg>/                     (created)
#   $OUT_DIR/diffs-leg<leg>/                    (created)
#
# Cost defense in depth:
#   * VP_DEV_MAX_COST_USD per cell (caller-overridable, default 10)
#   * MAX_TOTAL_COST_USD across the loop (caller-overridable, default 200);
#     dispatch aborts with exit 3 when the running sum (parsed from each
#     cell's envelope JSON) exceeds the cap.

set -euo pipefail

LEG="${1:-}"
DRY_PRINT=false
if [[ "${2:-}" == "--dry-print" ]]; then DRY_PRINT=true; fi
if [[ "$LEG" != "1" && "$LEG" != "2" ]]; then
  echo "Usage: $0 <1|2> [--dry-print]" >&2
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
MAX_TOTAL_COST_USD="${MAX_TOTAL_COST_USD:-200}"
export VP_DEV_MAX_COST_USD="${VP_DEV_MAX_COST_USD:-10}"

if [[ ! -f "$PICKS" ]]; then
  echo "ERROR: picks.tsv not found at $PICKS — run pick-specialists.cjs first." >&2
  exit 2
fi
if [[ ! -f "$CORPUS" ]]; then
  echo "ERROR: corpus.json not found at $CORPUS." >&2
  exit 2
fi

mkdir -p "$LOGS_DIR" "$DIFFS_DIR"

echo "[$(date -Iseconds)] dispatch-specialist-redo: leg=$LEG K=$REPLICATES model=$MODEL" >&2
echo "  out_dir=$OUT_DIR" >&2
echo "  per-cell cap=\$$VP_DEV_MAX_COST_USD; total cap=\$$MAX_TOTAL_COST_USD" >&2

# Parse corpus once via node — bash JSON is a footgun. Emits one TSV line per
# leg-matching corpus entry: issueId\trepo\tstate\tdecisionClass\tbaseSha
CORPUS_TSV="$(node -e '
  const fs = require("node:fs");
  const c = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
  const leg = Number(process.argv[2]);
  for (const i of c.issues) {
    if (Number(i.leg) !== leg) continue;
    const sha = i.baseSha || "";
    const state = i.state || "open";
    const cls = i.decisionClass || "";
    process.stdout.write([i.issueId, i.repo, state, cls, sha].join("\t") + "\n");
  }
' "$CORPUS" "$LEG")"

if [[ -z "$CORPUS_TSV" ]]; then
  echo "ERROR: no corpus issues found for leg=$LEG." >&2
  exit 2
fi

# Build a per-issue lookup of repo / state / baseSha so we don't re-parse.
declare -A ISSUE_REPO ISSUE_STATE ISSUE_SHA
while IFS=$'\t' read -r issueId repo state cls sha; do
  ISSUE_REPO["$issueId"]="$repo"
  ISSUE_STATE["$issueId"]="$state"
  ISSUE_SHA["$issueId"]="$sha"
done <<<"$CORPUS_TSV"

LEG_ISSUE_IDS=()
while IFS=$'\t' read -r issueId _ _ _ _; do
  LEG_ISSUE_IDS+=("$issueId")
done <<<"$CORPUS_TSV"

# Read picks.tsv (skip header) into an issueId→agentId map for the leg's
# issues. Pre-asserts: no trim-prefixed agentIds.
declare -A PICKED
while IFS=$'\t' read -r issueId agentId rationale score pickedLeg labels; do
  if [[ "$issueId" == "issueId" ]]; then continue; fi
  if [[ -z "$agentId" || "$agentId" == "fresh-mint" ]]; then
    echo "WARN: issue #$issueId has no concrete pick (rationale=$rationale) — skipping." >&2
    continue
  fi
  if [[ "$agentId" =~ ^agent-916a-trim- ]]; then
    echo "ERROR: trim agent $agentId leaked into picks for issue #$issueId. Re-run pick-specialists.cjs." >&2
    exit 4
  fi
  PICKED["$issueId"]="$agentId"
done <"$PICKS"

# Resolve the clone path for a target repo. Mirrors `resolveTargetRepoPath` in
# src/git/worktree.ts: defaults to $HOME/dev/<repo-name>, with a two-path
# fallback to $HOME/dev/vaultpilot/<repo-name> (issue #254) so a grouped
# layout works without an outer back-compat symlink. The whole loop runs
# serially (one cell at a time), so a single shared clone per repo is safe —
# `vp-dev spawn` manages its own worktrees inside the clone.
clone_path_for_repo() {
  local repo="$1"
  local name="${repo##*/}"
  local candidate
  for candidate in "${HOME:-/home}/dev/$name" "${HOME:-/home}/dev/vaultpilot/$name"; do
    if [[ -d "$candidate/.git" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  echo "ERROR: no clone at ${HOME:-/home}/dev/$name nor ${HOME:-/home}/dev/vaultpilot/$name for repo $repo. Clone it (gh repo clone $repo) before dispatching." >&2
  return 1
}

# Group dispatch by agent so cells on the same clone serialize naturally.
declare -A SEEN_AGENTS
ORDERED_AGENTS=()
for issueId in "${LEG_ISSUE_IDS[@]}"; do
  agent="${PICKED[$issueId]:-}"
  if [[ -z "$agent" ]]; then continue; fi
  if [[ -z "${SEEN_AGENTS[$agent]:-}" ]]; then
    SEEN_AGENTS["$agent"]=1
    ORDERED_AGENTS+=("$agent")
  fi
done

cell_count=0
for agent in "${ORDERED_AGENTS[@]}"; do
  for issueId in "${LEG_ISSUE_IDS[@]}"; do
    if [[ "${PICKED[$issueId]:-}" != "$agent" ]]; then continue; fi
    cell_count=$((cell_count + REPLICATES))
  done
done

echo "  unique agents: ${#ORDERED_AGENTS[@]}; cells (issues × K): $cell_count" >&2

total_cost=0
cells_done=0

# Best-effort cost extractor — mirror specialistBench/dispatch.ts:153-159 so
# the loop sees the same `costUsd` field the orchestrator emits.
extract_cost() {
  local log="$1"
  python3 -c '
import json, sys, re
text = open(sys.argv[1]).read()
# vp-dev spawn writes a top-level JSON to stdout containing costUsd.
m = re.search(r"\"costUsd\"\s*:\s*([0-9.]+)", text)
print(m.group(1) if m else "0")
' "$log" 2>/dev/null || echo 0
}

for agent in "${ORDERED_AGENTS[@]}"; do
  for issueId in "${LEG_ISSUE_IDS[@]}"; do
    if [[ "${PICKED[$issueId]:-}" != "$agent" ]]; then continue; fi
    repo="${ISSUE_REPO[$issueId]}"
    state="${ISSUE_STATE[$issueId]}"
    sha="${ISSUE_SHA[$issueId]}"

    if ! clone="$(clone_path_for_repo "$repo")"; then
      exit 5
    fi

    for r in $(seq 1 "$REPLICATES"); do
      if (( $(echo "$total_cost >= $MAX_TOTAL_COST_USD" | bc -l) )); then
        echo "[$(date -Iseconds)] BUDGET EXHAUSTED at \$$total_cost — aborting." >&2
        exit 3
      fi

      cell_id="bench-r${r}-${agent}-${issueId}"
      log_path="$LOGS_DIR/${cell_id}.log"
      diff_path="$DIFFS_DIR/${cell_id}.diff"

      if [[ -s "$log_path" ]]; then
        echo "[$(date -Iseconds)] skip (already exists): $cell_id" >&2
        cells_done=$((cells_done + 1))
        continue
      fi

      cmd=(npm run vp-dev -- spawn
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
        if [[ -n "$sha" ]]; then
          cmd+=(--replay-base-sha "$sha")
        fi
      fi

      cells_done=$((cells_done + 1))
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
done

echo "[$(date -Iseconds)] dispatch-specialist-redo: leg=$LEG complete. cells=$cells_done total_cost=\$$total_cost" >&2
