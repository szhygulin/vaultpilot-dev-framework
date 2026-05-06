#!/bin/bash
# 10 study agents × 10 issues = 100 cells. Each agent has its own dedicated clone of smoke-test
# at /tmp/study-clones/clone-N — no shared target-repo, no contention class.
set -u
cd /home/szhygulin/dev/vaultpilot-development-agents

ISSUES=(47 48 49 50 51 52 53 54 55 56)
AGENTS=(agent-9180 agent-9181 agent-9182 agent-9183 agent-9184 agent-9185 agent-9186 agent-9187 agent-9188 agent-9189)

CELLS=()
for is in "${ISSUES[@]}"; do
  for ag in "${AGENTS[@]}"; do
    CELLS+=("$ag $is")
  done
done

# Map agent → clone path (agent-918N → clone-(N+1))
agent_to_path() {
  local ag="$1"
  local n="${ag: -1}"  # last digit
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

printf '%s\n' "${CELLS[@]}" | xargs -P 10 -I {} bash -c 'cell="{}"; run_cell ${cell% *} ${cell##* }'
echo "[$(date +%H:%M:%S)] all 100 cells done"
