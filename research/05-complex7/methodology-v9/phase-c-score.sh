#!/usr/bin/env bash
# Phase C scoring — for each re-dispatched cell:
#   1. judge-A (Opus K=3) on the new diff
#   2. v6-style test scoring: reset clone to baseSha, apply diff, run fixed tests
# Outputs tests-v8.json (v6 + force-implement) and judge-v8.json
set -u

REPO_ROOT=/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework
OUT_BASE=/tmp/phase-c-redispatch
SCRATCH=/home/szhygulin/claude-work/phase-c-scratch
CORPUS=/tmp/complex7/curve-redo-data/complex7-tailored/corpus-complex7.json
FIXED=/tmp/complex7-fixed-tests
LOG=/tmp/phase-c-score.log
PUSHBACKS=/tmp/c7-pushbacks.txt
MAX_JOBS=4
: >$LOG

export VP_DEV_CLAUDE_BIN=$REPO_ROOT/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude

declare -A FRAMEWORK=( [vaultpilot-mcp]=vitest [vaultpilot-dev-framework]=node-test )
declare -A DEST=( [86]=src/state [100]=src/orchestrator [119]=src/agent [308]=test [325]=test [427]=test [460]=test )

score_one() {
  local arm=$1 cell=$2 agent=$3 issue=$4 target_repo=$5 idx=$6
  local clone=$SCRATCH/cell-${idx}-${cell}
  local log_path=$OUT_BASE/logs/${cell}.log
  local diff_path=$OUT_BASE/diffs/${cell}.diff
  local judge_out=$OUT_BASE/scores/${cell}-judge.json
  local tests_out=$OUT_BASE/scores/${cell}-tests-v8.json

  [ -s "$log_path" ] || { echo "[skip-no-log] $cell" >>$LOG; return 0; }

  # Decision from log
  local decision=$(python3 -c "
import json
data=open('$log_path').read()
idx=data.rfind('\n{\n')
try:
  j=json.loads(data[idx+1:])
  print(j.get('envelope',{}).get('decision','none'))
except: print('parse-fail')
" 2>/dev/null)
  echo "[score-start] $cell decision=$decision diff_bytes=$([ -f "$diff_path" ] && stat -c %s "$diff_path" || echo 0)" >>$LOG

  # 1. JUDGE (always; for implement decisions feeds A axis)
  if [ ! -s "$judge_out" ]; then
    local repo=${target_repo##*/}
    if [ "$decision" = "implement" ] && [ -s "$diff_path" ]; then
      # Filter diff to fit Opus context
      local filt_diff=$OUT_BASE/diffs/${cell}.filtered.diff
      node /tmp/strict-filter-diff.cjs "$diff_path" "$filt_diff" >>$LOG 2>&1
      node $REPO_ROOT/dist/bin/vp-dev.js research grade-reasoning \
        --issue $issue --target-repo $target_repo --decision implement \
        --diff-path "$filt_diff" --k 3 --out "$judge_out" >>$LOG 2>&1 || true
    elif [ "$decision" = "pushback" ]; then
      local pb=$OUT_BASE/scores/${cell}.pushback.txt
      python3 -c "
import json
data=open('$log_path').read()
idx=data.rfind('\n{\n')
try:
  j=json.loads(data[idx+1:])
  print(j.get('envelope',{}).get('reason',''))
except: pass
" >$pb
      [ -s "$pb" ] && node $REPO_ROOT/dist/bin/vp-dev.js research grade-reasoning \
        --issue $issue --target-repo $target_repo --decision pushback \
        --pushback-path "$pb" --k 3 --out "$judge_out" >>$LOG 2>&1 || true
    fi
  fi

  # 2. v6 tests on properly-reset clone
  if [ ! -s "$tests_out" ] && [ "$decision" = "implement" ] && [ -s "$diff_path" ]; then
    local expected_sha=$(jq -r --arg id "$issue" '.issues[] | select(.issueId == ($id | tonumber)) | .baseSha' "$CORPUS")
    local repo_name=${target_repo##*/}
    local framework=${FRAMEWORK[$repo_name]}
    local dest=${DEST[$issue]}
    local fixed_tests=$FIXED/$issue
    [ -d "$fixed_tests" ] || fixed_tests=/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees/complex7-data/research/curve-redo-bundle/curve-redo-tests-behavioral/$issue
    if [ ! -d "$fixed_tests" ]; then
      echo "[no-tests] $cell" >>$LOG
      return 0
    fi
    # Reset clone to baseSha
    (cd "$clone" && git reset --hard "$expected_sha" --quiet 2>/dev/null && git clean -fd --quiet 2>/dev/null) || true
    actual_sha=$(cd "$clone" && git rev-parse HEAD 2>/dev/null | cut -c1-12)
    if [ "${actual_sha:0:12}" != "${expected_sha:0:12}" ]; then
      echo "[fail-reset] $cell actual=$actual_sha expected=$expected_sha" >>$LOG
      return 0
    fi
    # Apply diff (cascade: strict → 3way → reject)
    local apply_status="none"
    if (cd "$clone" && git apply --check "$diff_path" 2>/dev/null && git apply "$diff_path" 2>/dev/null); then
      apply_status="clean"
    elif (cd "$clone" && git apply --3way "$diff_path" 2>/dev/null); then
      apply_status="3way"
    else
      (cd "$clone" && git apply --reject "$diff_path" 2>/dev/null) || true
      local rej=$(find "$clone" -name '*.rej' -not -path '*/.git/*' 2>/dev/null | wc -l)
      [ "$rej" -gt 0 ] && apply_status="partial" || apply_status="all-rejected"
      find "$clone" -name '*.rej' -not -path '*/.git/*' -delete 2>/dev/null || true
    fi
    # npm install if missing
    if [ ! -d "$clone/node_modules" ] && [ -f "$clone/package.json" ]; then
      (cd "$clone" && npm ci --no-audit --no-fund --silent >>$LOG 2>&1) || true
    fi
    # Copy + run hidden tests (ONLY the hidden tests, not the entire dest dir)
    local dest_abs="$clone/$dest"
    mkdir -p "$dest_abs"
    rm -f "$dest_abs"/b3-*.test.ts "$dest_abs"/b4-*.test.ts "$dest_abs"/b5-*.test.ts "$dest_abs"/b6-*.test.ts 2>/dev/null
    # Build explicit list of hidden-test paths (copy + record list)
    local hidden=()
    for src_test in "$fixed_tests"/*.test.ts; do
      [ -f "$src_test" ] || continue
      cp "$src_test" "$dest_abs/"
      hidden+=("$dest_abs/$(basename "$src_test")")
    done
    local pass=0 total=0
    if [ ${#hidden[@]} -gt 0 ]; then
      if [ "$framework" = "vitest" ]; then
        (cd "$clone" && npx vitest run --reporter=default "${hidden[@]}" 2>&1) >$OUT_BASE/scores/${cell}.tests.log
        pass=$(grep -E "Tests\s+" "$OUT_BASE/scores/${cell}.tests.log" | grep -oE "[0-9]+ passed" | head -1 | grep -oE "[0-9]+")
        total=$(grep -E "Tests\s+.*\([0-9]+\)" "$OUT_BASE/scores/${cell}.tests.log" | grep -oE "\([0-9]+\)$" | tr -d '()' | head -1)
      else
        (cd "$clone" && timeout 90 npx tsx --test "${hidden[@]}" 2>&1) >$OUT_BASE/scores/${cell}.tests.log
        pass=$(grep -E "^# pass\s+" $OUT_BASE/scores/${cell}.tests.log | awk '{print $NF}')
        total=$(grep -E "^# tests\s+" $OUT_BASE/scores/${cell}.tests.log | awk '{print $NF}')
      fi
    fi
    pass=${pass:-0}; total=${total:-0}
    local apply_clean_json="true"
    case "$apply_status" in
      none|all-rejected) apply_clean_json="false" ;;
    esac
    python3 -c "
import json
open('$tests_out','w').write(json.dumps({
  'passed': $pass, 'failed': $((total - pass)), 'errored': 0, 'total': $total,
  'applyCleanly': $apply_clean_json,
  'applyStatus': '$apply_status',
  'baseShaResetTo': '$expected_sha',
  'v8': True, 'forceImplement': True
}, indent=2) + '\n')
" 2>>$LOG || python3 -c "
open('$tests_out','w').write('{\"passed\": $pass, \"failed\": $((total - pass)), \"total\": $total, \"applyCleanly\": $apply_clean_json, \"v8\": true}\n')
"
  fi

  echo "[score-done] $cell" >>$LOG
}
export -f score_one
export REPO_ROOT OUT_BASE SCRATCH CORPUS FIXED LOG VP_DEV_CLAUDE_BIN
declare -p FRAMEWORK DEST >/tmp/phase-c-env.sh

QUEUE=/tmp/phase-c-score-queue.txt
: >$QUEUE
i=0
while IFS='|' read -r arm cell agent issue target_repo; do
  i=$((i+1))
  echo "$arm $cell $agent $issue $target_repo $i" >>$QUEUE
done < $PUSHBACKS
echo "queue size: $(wc -l < $QUEUE)" | tee -a $LOG

xargs -a $QUEUE -P $MAX_JOBS -L1 bash -c '
  source /tmp/phase-c-env.sh
  score_one "$1" "$2" "$3" "$4" "$5" "$6"
' _

echo "ALL SCORED" >>$LOG
