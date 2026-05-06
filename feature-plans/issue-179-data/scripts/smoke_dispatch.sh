#!/bin/bash
# Full study: 7 agents × 10 issues = 70 spawns against vaultpilot-mcp-smoke-test.
# Parallelism via xargs -P 3 (matches pilot's 3-way; pilot had 1/15 worktree error).
set -u
cd /home/szhygulin/dev/vaultpilot-development-agents

AGENTS=(agent-9171 agent-9172 agent-9173 agent-9174 agent-9175 agent-9176 agent-9177)
ISSUES=(47 48 49 50 51 52 53 54 55 56)
TARGET_REPO=szhygulin/vaultpilot-mcp-smoke-test
TARGET_PATH=/home/szhygulin/dev/vaultpilot-smoke-test

# Build cell list
CELLS=()
for ag in "${AGENTS[@]}"; do
  for is in "${ISSUES[@]}"; do
    CELLS+=("$ag $is")
  done
done

run_cell() {
  local agent="$1"
  local issue="$2"
  local logf="logs/smoke-${agent}-${issue}.log"
  echo "[$(date +%H:%M:%S)] $agent / #$issue start"
  npm run vp-dev -- spawn \
    --agent "$agent" \
    --issue "$issue" \
    --target-repo "$TARGET_REPO" \
    --target-repo-path "$TARGET_PATH" \
    --dry-run --skip-summary \
    > "$logf" 2>&1
  local rc=$?
  echo "[$(date +%H:%M:%S)] $agent / #$issue done (rc=$rc)"
}
export -f run_cell
export TARGET_REPO TARGET_PATH

# Dispatch with parallelism=3 via xargs
printf '%s\n' "${CELLS[@]}" | xargs -P 3 -I {} bash -c 'cell="{}"; run_cell ${cell% *} ${cell##* }'

echo "[$(date +%H:%M:%S)] all 70 cells done"
