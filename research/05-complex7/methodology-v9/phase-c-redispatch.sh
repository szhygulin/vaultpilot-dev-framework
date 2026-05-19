#!/usr/bin/env bash
# Phase C — re-dispatch the 19 pushback cells with VP_DEV_FORCE_IMPLEMENT=1.
# Output goes to a new "phase-c" directory; the originals are NOT overwritten.
set -u

REPO_ROOT=/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework
MAX_JOBS=4
PUSHBACKS=/tmp/c7-pushbacks.txt
OUT_BASE=/tmp/phase-c-redispatch
SCRATCH=/tmp/phase-c-scratch
LOG=/tmp/phase-c-dispatch.log
: >$LOG

mkdir -p $OUT_BASE/{logs,diffs,scores}
mkdir -p $SCRATCH

# Pre-create per-cell scratch clones
echo "Preparing scratch clones..." | tee -a $LOG
i=0
while IFS='|' read -r arm cell agent issue target_repo; do
  i=$((i+1))
  src_dir=""
  case "$target_repo" in
    *vaultpilot-mcp*) src_dir=$HOME/dev/vaultpilot/vaultpilot-mcp ;;
    *vaultpilot-dev-framework*) src_dir=$HOME/dev/vaultpilot/vaultpilot-dev-framework ;;
  esac
  clone_dir=$SCRATCH/cell-${i}-${cell}
  if [ ! -d "$clone_dir/.git" ]; then
    git clone -q "$src_dir" "$clone_dir" >>$LOG 2>&1
  fi
done < $PUSHBACKS

dispatch_one() {
  local arm=$1 cell=$2 agent=$3 issue=$4 target_repo=$5 idx=$6
  local clone_dir=$SCRATCH/cell-${idx}-${cell}
  local log_path=$OUT_BASE/logs/${cell}.log
  local diff_path=$OUT_BASE/diffs/${cell}.diff
  [ -s "$log_path" ] && { echo "[skip-done] $cell" >>$LOG; return 0; }
  # Per-arm worktree: agents are registered there, NOT in the main worktree
  local arm_wt=/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees/${arm}-complex7
  echo "[start] $arm/$cell agent=$agent issue=$issue clone=$clone_dir wt=$arm_wt" >>$LOG
  (cd "$arm_wt" && VP_DEV_FORCE_IMPLEMENT=1 VP_DEV_CLAUDE_BIN=$REPO_ROOT/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude \
    node $REPO_ROOT/dist/bin/vp-dev.js spawn \
      --agent "$agent" \
      --issue "$issue" \
      --target-repo "$target_repo" \
      --target-repo-path "$clone_dir" \
      --dry-run \
      --no-registry-mutation \
      --allow-closed-issue --issue-body-only --no-target-claude-md \
      --model claude-sonnet-4-6 \
      --capture-diff-path "$diff_path") \
    > "$log_path" 2>&1 || true
  if [ -s "$log_path" ]; then
    decision=$(python3 -c "
import json
data=open('$log_path').read()
idx=data.rfind('\n{\n')
try:
  j=json.loads(data[idx+1:])
  print(j.get('envelope',{}).get('decision','none'))
except: print('parse-fail')
" 2>/dev/null)
    echo "[done] $cell decision=$decision diff_bytes=$([ -f "$diff_path" ] && stat -c %s "$diff_path" || echo 0)" >>$LOG
  else
    echo "[fail] $cell (no log output)" >>$LOG
  fi
}
export -f dispatch_one
export REPO_ROOT SCRATCH OUT_BASE LOG

# Build queue with indices
QUEUE=/tmp/phase-c-queue.txt
: >$QUEUE
i=0
while IFS='|' read -r arm cell agent issue target_repo; do
  i=$((i+1))
  echo "$arm $cell $agent $issue $target_repo $i" >>$QUEUE
done < $PUSHBACKS
echo "queue size: $(wc -l < $QUEUE)" | tee -a $LOG

xargs -a $QUEUE -P $MAX_JOBS -L1 bash -c 'dispatch_one "$1" "$2" "$3" "$4" "$5" "$6"' _

echo "ALL DISPATCHED" >>$LOG
