#!/bin/bash
# Dispatch all 15 cells. 3 parallel processes by agent; sequential within each agent.
set -u
cd /home/szhygulin/dev/vaultpilot-development-agents

run_agent() {
  local agent="$1"
  for issue in 649 574 565 162 156; do
    echo "[$(date +%H:%M:%S)] $agent / #$issue start"
    npm run vp-dev -- spawn --agent "$agent" --issue "$issue" \
      --target-repo szhygulin/vaultpilot-mcp \
      --dry-run --skip-summary \
      > "logs/study-$agent-$issue.log" 2>&1
    local rc=$?
    echo "[$(date +%H:%M:%S)] $agent / #$issue done (rc=$rc)"
  done
}

run_agent agent-9161 &
PID_A=$!
run_agent agent-9162 &
PID_B=$!
run_agent agent-9163 &
PID_C=$!

wait $PID_A $PID_B $PID_C
echo "[$(date +%H:%M:%S)] all done"
