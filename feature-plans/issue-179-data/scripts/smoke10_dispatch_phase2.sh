#!/bin/bash
# Phase 2: dispatch remaining cells after killing strays + in-flight finished.
# Issue set: option-1 cuts to {47, 48, 50, 52, 54}. Already dispatched/done elsewhere.
# Remaining: #50 (8 cells, since 9180/9181 done in flight) + #52 (10) + #54 (10) = 28 cells.
set -u
cd /home/szhygulin/dev/vaultpilot-development-agents

agent_to_path() {
  local ag="$1"
  local n="${ag: -1}"
  echo "/tmp/study-clones/clone-$((n + 1))"
}
export -f agent_to_path

run_cell() {
  local agent="$1"
  local issue="$2"
  local path
  path="$(agent_to_path "$agent")"
  local logf="logs/smoke10-${agent}-${issue}.log"
  echo "[$(date +%H:%M:%S)] $agent / #$issue (path=$path) start"
  npm run vp-dev -- spawn \
    --agent "$agent" \
    --issue "$issue" \
    --target-repo szhygulin/vaultpilot-mcp-smoke-test \
    --target-repo-path "$path" \
    --dry-run --skip-summary \
    > "$logf" 2>&1
  local rc=$?
  echo "[$(date +%H:%M:%S)] $agent / #$issue done (rc=$rc)"
}
export -f run_cell

# Build cells list (round-robin: each issue, all agents)
CELLS=()
# #50: skip 9180, 9181 (those were in flight already)
for ag in 9182 9183 9184 9185 9186 9187 9188 9189; do
  CELLS+=("agent-$ag 50")
done
# #52: all 10
for ag in 9180 9181 9182 9183 9184 9185 9186 9187 9188 9189; do
  CELLS+=("agent-$ag 52")
done
# #54: all 10
for ag in 9180 9181 9182 9183 9184 9185 9186 9187 9188 9189; do
  CELLS+=("agent-$ag 54")
done

echo "Dispatching ${#CELLS[@]} cells at parallelism=10"
printf '%s\n' "${CELLS[@]}" | xargs -P 10 -I {} bash -c 'cell="{}"; run_cell ${cell% *} ${cell##* }'
echo "[$(date +%H:%M:%S)] phase 2 complete"
