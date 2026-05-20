#!/usr/bin/env bash
# v6 rescore — FIXED to properly reset each clone to corpus baseSha BEFORE
# applying the diff. The v3 script silently reset to origin/main instead of
# the issue's baseSha, contaminating clones with the canonical PR fix.
#
# v6 does:
#   1. For each cell: identify expected baseSha from corpus.json
#   2. Reset the EXISTING v3-score-clone to baseSha
#   3. Re-apply the agent's diff (filtered version)
#   4. Run v5 tests
#   5. Emit tests-v6.json, capture clone's actual HEAD post-reset as proof

set -u

WT=/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees
FIXED=/tmp/complex7-fixed-tests
CORPUS=/tmp/complex7/curve-redo-data/complex7-tailored/corpus-complex7.json
LOG=/tmp/v6-rescore.log
MAX_JOBS=4
: >$LOG

# Issue → repo, framework, dest
declare -A REPO=( [86]=vaultpilot-dev-framework [100]=vaultpilot-dev-framework [119]=vaultpilot-dev-framework [308]=vaultpilot-mcp [325]=vaultpilot-mcp [427]=vaultpilot-mcp [460]=vaultpilot-mcp )
declare -A FRAMEWORK=( [vaultpilot-mcp]=vitest [vaultpilot-dev-framework]=node-test )
declare -A DEST=( [86]=src/state [100]=src/orchestrator [119]=src/agent [308]=test [325]=test [427]=test [460]=test )
declare -A ARM_DIR=( [tailored]=tailored-complex7 [prose]=prose-complex7 [trim]=trim-complex7 [generalist]=generalist-complex7 )

# Cache baseSha per issue
declare -A BASE_SHA
for issue in 86 100 119 308 325 427 460; do
  BASE_SHA[$issue]=$(jq -r --arg id "$issue" '.issues[] | select(.issueId == ($id | tonumber)) | .baseSha' "$CORPUS")
done

score_one() {
  local arm=$1 cell=$2 issue=$3
  local arm_dir=${ARM_DIR[$arm]}
  local clone="$WT/$arm_dir/research/curve-redo-data/v2-scoring/$arm_dir/v3-score-clones/${cell}"
  [ -d "$clone" ] || { echo "[skip-noclone] $arm/$cell" >>$LOG; return 0; }

  local out_dir="$WT/$arm_dir/research/curve-redo-data/v2-scoring/$arm_dir"
  local out="$out_dir/${cell}-tests-v6.json"
  [ -s "$out" ] && { echo "[skip-done] $arm/$cell" >>$LOG; return 0; }

  local expected_sha=${BASE_SHA[$issue]}
  local repo=${REPO[$issue]}
  local framework=${FRAMEWORK[$repo]}
  local dest=${DEST[$issue]}
  local fixed_tests="$FIXED/$issue"
  if [ ! -d "$fixed_tests" ]; then
    # No fixed tests for this issue — fall back to v4 corpus
    fixed_tests="/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees/complex7-data/research/curve-redo-bundle/curve-redo-tests-behavioral/$issue"
  fi
  if [ ! -d "$fixed_tests" ]; then
    echo "[skip-no-tests] $arm/$cell issue=$issue" >>$LOG
    return 0
  fi

  local cell_log="/tmp/v6-cell-${arm}-${cell}.log"
  : >"$cell_log"
  echo "[start] $arm/$cell issue=$issue expected_sha=$expected_sha" >>$LOG

  # STEP 1: reset clone to baseSha (verified post-reset)
  cd "$clone" || { echo "[fail-cd] $arm/$cell" >>$LOG; return 0; }
  # Fetch the SHA in case it's not in the clone
  git fetch --quiet origin "$expected_sha" 2>/dev/null || true
  # Force reset
  if ! git reset --hard "$expected_sha" --quiet 2>>"$cell_log"; then
    echo "[fail-reset] $arm/$cell to $expected_sha" >>$LOG
    return 0
  fi
  git clean -fd --quiet 2>/dev/null || true
  # Verify reset success
  local actual_sha
  actual_sha=$(git rev-parse HEAD 2>/dev/null)
  if [ "${actual_sha:0:12}" != "${expected_sha:0:12}" ]; then
    echo "[fail-verify] $arm/$cell actual=$actual_sha expected=$expected_sha" >>$LOG
    return 0
  fi

  # STEP 2: apply the agent's diff (filtered version preferred — strips noise)
  local filtered_diff="$WT/$arm_dir/research/curve-redo-data/v2-scoring/$arm_dir/v3-filtered-diffs/${cell}.diff"
  local diff_path="$filtered_diff"
  if [ ! -s "$diff_path" ]; then
    # Fall back to raw diff
    for d in "$WT/$arm_dir/research/curve-redo-data/complex7-${arm}/diffs-leg1/${cell}.diff" \
             "$WT/$arm_dir/research/curve-redo-data/complex7-${arm}/diffs-leg2/${cell}.diff" \
             "/tmp/complex7/curve-redo-data/complex7-${arm}/diffs-leg1/${cell}.diff" \
             "/tmp/complex7/curve-redo-data/complex7-${arm}/diffs-leg2/${cell}.diff"; do
      if [ -s "$d" ]; then diff_path="$d"; break; fi
    done
  fi

  local apply_status="none"
  if [ -s "$diff_path" ]; then
    if git apply --check "$diff_path" >>"$cell_log" 2>&1 && git apply "$diff_path" >>"$cell_log" 2>&1; then
      apply_status="clean"
    elif git apply --3way "$diff_path" >>"$cell_log" 2>&1; then
      apply_status="3way"
    elif git apply --reject "$diff_path" >>"$cell_log" 2>&1 || true; then
      local rej_count=$(find . -name '*.rej' -not -path './.git/*' 2>/dev/null | wc -l)
      local total_hunks=$(grep -c '^@@' "$diff_path" 2>/dev/null || echo 0)
      if [ "$rej_count" -eq 0 ]; then
        apply_status="reject-clean"
      elif [ "$total_hunks" -gt 0 ] && [ "$rej_count" -lt "$total_hunks" ]; then
        apply_status="partial-${rej_count}-of-${total_hunks}"
      else
        apply_status="all-rejected"
      fi
      find . -name '*.rej' -not -path '*/.git/*' -delete 2>/dev/null || true
    fi
  else
    apply_status="empty-diff"
  fi
  echo "[apply] $arm/$cell status=$apply_status" >>$LOG

  # STEP 3: ensure node_modules (clones already have them from v3 run)
  if [ ! -d "$clone/node_modules" ] && [ -f "$clone/package.json" ]; then
    (cd "$clone" && npm ci --no-audit --no-fund --silent >>"$cell_log" 2>&1) || true
  fi

  # STEP 4: copy fixed tests + run
  local dest_abs="$clone/$dest"
  mkdir -p "$dest_abs"
  # Wipe ANY pre-existing test files in dest_abs that match our patterns
  rm -f "$dest_abs"/b3-*.test.ts "$dest_abs"/b4-*.test.ts "$dest_abs"/b5-*.test.ts "$dest_abs"/b6-*.test.ts 2>/dev/null
  cp "$fixed_tests"/*.test.ts "$dest_abs/" 2>/dev/null || true

  # Build explicit list of hidden-test files (only the ones we just copied)
  local hidden_files=()
  for src_test in "$fixed_tests"/*.test.ts; do
    [ -f "$src_test" ] || continue
    hidden_files+=("$dest_abs/$(basename "$src_test")")
  done
  if [ ${#hidden_files[@]} -eq 0 ]; then
    echo "[fail-no-hidden-tests] $arm/$cell" >>$LOG
    return 0
  fi

  local pass=0 total=0
  if [ "$framework" = "vitest" ]; then
    # vitest run with explicit file args runs ONLY those files
    (cd "$clone" && npx vitest run --reporter=default "${hidden_files[@]}" 2>&1) >"$cell_log.tests"
    pass=$(grep -E "Tests\s+" "$cell_log.tests" | grep -oE "[0-9]+ passed" | head -1 | grep -oE "[0-9]+")
    total=$(grep -E "Tests\s+.*\([0-9]+\)" "$cell_log.tests" | grep -oE "\([0-9]+\)$" | tr -d '()' | head -1)
  else
    (cd "$clone" && timeout 90 npx tsx --test "${hidden_files[@]}" 2>&1) >"$cell_log.tests"
    pass=$(grep -E "^# pass\s+" "$cell_log.tests" | awk '{print $NF}')
    total=$(grep -E "^# tests\s+" "$cell_log.tests" | awk '{print $NF}')
  fi
  pass=${pass:-0}; total=${total:-0}
  local fail=$((total - pass))

  local apply_clean="true"
  case "$apply_status" in
    none|empty-diff|all-rejected) apply_clean="false" ;;
  esac

  local apply_clean_json="true"
  [ "$apply_clean" = "false" ] && apply_clean_json="false"
  python3 -c "
import json
open('$out','w').write(json.dumps({
  'passed': $pass, 'failed': $fail, 'errored': 0, 'total': $total,
  'applyCleanly': $apply_clean_json,
  'applyStatus': '$apply_status',
  'baseShaResetTo': '$expected_sha',
  'v6': True
}, indent=2) + '\n')
" 2>>"$cell_log" || python3 -c "
open('$out','w').write('{\"passed\": $pass, \"failed\": $fail, \"total\": $total, \"applyCleanly\": $apply_clean_json, \"v6\": true}\n')
"
  echo "[done] $arm/$cell -> $pass/$total apply=$apply_status" >>$LOG
}
export -f score_one
export WT FIXED CORPUS LOG
declare -p REPO FRAMEWORK DEST ARM_DIR BASE_SHA >/tmp/v6-env.sh

QUEUE=/tmp/v6-queue.txt
: >$QUEUE
for arm in tailored prose trim generalist; do
  arm_dir="${ARM_DIR[$arm]}"
  for clone_path in "$WT/$arm_dir"/research/curve-redo-data/v2-scoring/"$arm_dir"/v3-score-clones/*/; do
    cell=$(basename "$clone_path")
    [ "$cell" = "*" ] && continue
    issue=$(echo "$cell" | grep -oE '[0-9]+$')
    echo "$arm $cell $issue" >>$QUEUE
  done
done
echo "queue size: $(wc -l < $QUEUE)" | tee -a $LOG

xargs -a $QUEUE -P $MAX_JOBS -L1 bash -c '
  source /tmp/v6-env.sh
  score_one "$1" "$2" "$3"
' _

echo "ALL DONE" >>$LOG
