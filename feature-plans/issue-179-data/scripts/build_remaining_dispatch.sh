#!/bin/bash
set -u
cd /home/szhygulin/dev/vaultpilot-development-agents

# Determine which cells are already done (have a completed-shape log file with the closing JSON envelope)
# A cell is "done" if its log file exists AND ends with a JSON } at column 0 (envelope marker)
DONE=()
for ag in 9171 9172 9173 9174 9175 9176 9177; do
  for is in 47 48 49 50 51 52 53 54 55 56; do
    f="logs/smoke-agent-${ag}-${is}.log"
    if [[ -f "$f" ]]; then
      # Check if the file has a final JSON envelope (last line is `}`)
      if tail -1 "$f" 2>/dev/null | grep -q '^}$'; then
        DONE+=("$ag-$is")
      fi
    fi
  done
done
echo "Already done (envelope-complete): ${#DONE[@]} cells"
printf '  %s\n' "${DONE[@]}"

# Build round-robin INTERLEAVED cell list of REMAINING cells.
# Round-robin by issue (not by agent): for each issue, all 7 agents.
# This avoids the all-9171-first pattern.
REMAINING=()
for is in 47 48 49 50 51 52 53 54 55 56; do
  for ag in 9171 9172 9173 9174 9175 9176 9177; do
    cell="agent-${ag} ${is}"
    key="${ag}-${is}"
    skip=0
    for d in "${DONE[@]}"; do
      [[ "$d" == "$key" ]] && skip=1 && break
    done
    [[ $skip -eq 0 ]] && REMAINING+=("$cell")
  done
done
echo
echo "Remaining cells: ${#REMAINING[@]}"

run_cell() {
  local agent="$1"
  local issue="$2"
  local logf="logs/smoke-${agent}-${issue}.log"
  echo "[$(date +%H:%M:%S)] $agent / #$issue start"
  npm run vp-dev -- spawn \
    --agent "$agent" \
    --issue "$issue" \
    --target-repo szhygulin/vaultpilot-mcp-smoke-test \
    --target-repo-path /home/szhygulin/dev/vaultpilot-smoke-test \
    --dry-run --skip-summary \
    > "$logf" 2>&1
  local rc=$?
  echo "[$(date +%H:%M:%S)] $agent / #$issue done (rc=$rc)"
}
export -f run_cell

# Dispatch remaining at parallelism=5
printf '%s\n' "${REMAINING[@]}" | xargs -P 5 -I {} bash -c 'cell="{}"; run_cell ${cell% *} ${cell##* }'
echo "[$(date +%H:%M:%S)] all remaining cells done"
