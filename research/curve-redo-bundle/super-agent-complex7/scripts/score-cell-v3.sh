#!/usr/bin/env bash
# v3-rescore: filter the diff (strip non-implementation), apply with --3way
# (fallback to --reject), then run hidden tests in --baseline-only mode (since
# we've already applied) and post-process the output to record the real
# applyCleanly / applyError values.
#
# Usage:
#   score-cell-v3.sh <cellKey> <diffPath> <issueId> <testsDir> <outJson> [testsDestRelDir]

set -e

CELL=$1
DIFF=$2
ISSUE=$3
TESTS=$4
OUT=$5
DEST=${6:-}

REPO_ROOT=/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees/trim-complex7
CLONES=$REPO_ROOT/research/curve-redo-data/v2-scoring/trim-complex7/v3-score-clones
FILTERED_DIR=$REPO_ROOT/research/curve-redo-data/v2-scoring/trim-complex7/v3-filtered-diffs
CORPUS=$REPO_ROOT/research/curve-redo-bundle/corpus.json
LOG_DIR=$REPO_ROOT/research/curve-redo-data/v2-scoring/trim-complex7/v3-logs

mkdir -p "$CLONES" "$FILTERED_DIR" "$LOG_DIR"

META=$(node -e "
const c = JSON.parse(require('fs').readFileSync('$CORPUS','utf8'));
const i = c.issues.find(x => x.issueId === $ISSUE);
if (!i) { console.error('no issue'); process.exit(1); }
console.log(JSON.stringify({sha: i.baseSha || '', repo: i.repo, framework: i.framework, testsDest: i.testsDestRelDir || ''}));
")

SHA=$(echo "$META" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).sha)")
REPO=$(echo "$META" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).repo)")
FRAMEWORK=$(echo "$META" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).framework)")
TESTS_DEST=${DEST:-$(echo "$META" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).testsDest)")}

REPO_NAME=${REPO##*/}
CLONE_DIR=$CLONES/${CELL}

SRC=""
for candidate in $HOME/dev/$REPO_NAME $HOME/dev/vaultpilot/$REPO_NAME; do
  if [ -d "$candidate/.git" ]; then
    SRC=$candidate
    break
  fi
done

if [ -z "$SRC" ]; then
  echo "ERROR: no source clone found for $REPO_NAME at $HOME/dev/ or $HOME/dev/vaultpilot/" >&2
  exit 1
fi

# Step 1: filter the diff
FILTERED=$FILTERED_DIR/${CELL}.diff
node "$REPO_ROOT/scripts/filter-diff.cjs" "$DIFF" "$FILTERED" >>"$LOG_DIR/${CELL}.log" 2>&1

# Step 2: fresh clone at baseSha
if [ ! -d "$CLONE_DIR/.git" ]; then
  echo "[v3] cloning $SRC -> $CLONE_DIR" >>"$LOG_DIR/${CELL}.log"
  git clone -q "$SRC" "$CLONE_DIR" >>"$LOG_DIR/${CELL}.log" 2>&1
fi

cd "$CLONE_DIR"
git -c advice.detachedHead=false fetch --quiet origin 2>/dev/null || true
if [ -n "$SHA" ]; then
  git fetch --quiet origin "$SHA" 2>/dev/null || true
  git reset --hard "$SHA" --quiet
else
  git fetch --quiet origin main && git reset --hard origin/main --quiet
fi
git clean -fd --quiet 2>/dev/null || true

# Step 3: apply filtered diff with --3way, fallback to --reject
APPLY_STATUS="clean"
APPLY_ERR_TAG="ok"
APPLY_LOG=$LOG_DIR/${CELL}.apply.log
: > "$APPLY_LOG"

if [ ! -s "$FILTERED" ]; then
  # empty filtered diff after stripping — treat as clean no-op apply
  APPLY_STATUS="clean"
  APPLY_ERR_TAG="filtered-diff-empty"
else
  # Cascade: --check (dry-run) → strict → --3way → --reject. Each strictly
  # more permissive than the last. `--check` is a free pre-flight that
  # tells us if strict will succeed WITHOUT dirtying the worktree.
  if git apply --check "$FILTERED" >"$APPLY_LOG" 2>&1 && git apply "$FILTERED" >>"$APPLY_LOG" 2>&1; then
    APPLY_STATUS="clean"
    APPLY_ERR_TAG="strict-clean"
  elif (git checkout -- . 2>/dev/null; git clean -fd --quiet 2>/dev/null; git apply --3way "$FILTERED" >>"$APPLY_LOG" 2>&1); then
    APPLY_STATUS="clean"
    APPLY_ERR_TAG="3way-clean"
  else
    # Reset and try --reject (without --3way — they're mutually exclusive
    # in modern git). `--reject` writes `.rej` files for hunks that don't
    # apply but lets all applicable hunks land. Exit code is 1 when ANY
    # hunk is rejected; we treat that as "partial" success, not failure.
    git checkout -- . 2>/dev/null || true
    git clean -fd --quiet 2>/dev/null || true
    git apply --reject "$FILTERED" >>"$APPLY_LOG" 2>&1 || true
    # Count .rej files vs total hunks to decide clean / partial / failed.
    REJ_COUNT=$(find . -name '*.rej' -not -path './.git/*' 2>/dev/null | wc -l)
    TOTAL_HUNKS=$(grep -c '^@@' "$FILTERED" 2>/dev/null || echo 0)
    if [ "$REJ_COUNT" -eq 0 ]; then
      APPLY_STATUS="clean"
      APPLY_ERR_TAG="reject-all-applied"
    elif [ "$TOTAL_HUNKS" -gt 0 ] && [ "$REJ_COUNT" -lt "$TOTAL_HUNKS" ]; then
      APPLY_STATUS="partial"
      APPLY_ERR_TAG="reject-with-${REJ_COUNT}-of-${TOTAL_HUNKS}"
    else
      APPLY_STATUS="failed"
      APPLY_ERR_TAG="all-hunks-rejected"
    fi
    echo "[v3] reject-file-count=$REJ_COUNT total-hunks=$TOTAL_HUNKS" >>"$APPLY_LOG"
  fi
fi

echo "[v3] apply status=$APPLY_STATUS" >>"$LOG_DIR/${CELL}.log"

# Step 3.5: clean up .rej files left by --reject path. They confuse downstream
# tools (npm sees package.json.rej as a stray file) and don't help us — the
# implementation hunks that mattered already landed in their real files.
find "$CLONE_DIR" -name '*.rej' -not -path '*/.git/*' -delete 2>/dev/null || true

# Step 4: install deps if needed (vitest cells need node_modules for vitest binary)
# Try npm ci first (fast, deterministic); fall back to npm install when the
# diff changed package.json without updating package-lock.json (lockfile mismatch).
# When `package.json` itself didn't apply cleanly (cell 100), package-lock.json
# is at baseSha but package.json is mid-state — try npm install which regenerates
# the lockfile, and on its failure check out package.json from HEAD to restore
# clean baseSha state for a last-resort npm ci.
if [ -f "$CLONE_DIR/package.json" ] && [ ! -d "$CLONE_DIR/node_modules" ]; then
  echo "[v3] npm ci..." >>"$LOG_DIR/${CELL}.log"
  if ! (cd "$CLONE_DIR" && npm ci --no-audit --no-fund --silent >>"$LOG_DIR/${CELL}.log" 2>&1); then
    echo "[v3] npm ci failed, fallback npm install..." >>"$LOG_DIR/${CELL}.log"
    if ! (cd "$CLONE_DIR" && npm install --no-audit --no-fund --silent >>"$LOG_DIR/${CELL}.log" 2>&1); then
      echo "[v3] npm install failed; restoring package.json from HEAD..." >>"$LOG_DIR/${CELL}.log"
      (cd "$CLONE_DIR" && git checkout HEAD -- package.json package-lock.json 2>/dev/null && \
        npm ci --no-audit --no-fund --silent >>"$LOG_DIR/${CELL}.log" 2>&1) || \
        echo "[v3] all install attempts failed" >>"$LOG_DIR/${CELL}.log"
    fi
  fi
fi

cd "$REPO_ROOT"

# Step 5: run-tests with --baseline-only (we already applied)
TMP_OUT=$(mktemp)
CMD="npm run vp-dev -- research run-tests --baseline-only --tests-dir $TESTS --clone-dir $CLONE_DIR --framework $FRAMEWORK --out $TMP_OUT"
if [ -n "$TESTS_DEST" ]; then
  CMD="$CMD --tests-dest-rel-dir $TESTS_DEST"
fi

eval $CMD >>"$LOG_DIR/${CELL}.log" 2>&1 || echo "  WARN: run-tests non-zero" >>"$LOG_DIR/${CELL}.log"

# Step 6: post-process — overwrite applyCleanly with real status
# Treat both "clean" and "partial" as applyCleanly=true (we have signal to
# score). Only "failed" reports applyCleanly=false. Downstream callers that
# want stricter filtering can read `applyStatus` directly.
APPLY_CLEAN_BOOL="false"
if [ "$APPLY_STATUS" = "clean" ] || [ "$APPLY_STATUS" = "partial" ]; then
  APPLY_CLEAN_BOOL="true"
fi

# Export apply metadata for node post-process (avoid shell-interpolating
# multi-line apply log into a node -e string).
export V3_APPLY_STATUS="$APPLY_STATUS"
export V3_APPLY_ERR_TAG="$APPLY_ERR_TAG"
export V3_APPLY_CLEAN="$APPLY_CLEAN_BOOL"
export V3_APPLY_LOG_PATH="$APPLY_LOG"
export V3_TMP_OUT="$TMP_OUT"
export V3_OUT="$OUT"
export V3_CELL="$CELL"

node -e '
  const fs = require("fs");
  const tmp = process.env.V3_TMP_OUT;
  const out = process.env.V3_OUT;
  let j;
  if (fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
    j = JSON.parse(fs.readFileSync(tmp, "utf8"));
  } else {
    j = { passed: 0, failed: 0, errored: 0, total: 0, errorReason: "run-tests produced no output" };
  }
  j.applyCleanly = process.env.V3_APPLY_CLEAN === "true";
  j.applyStatus = process.env.V3_APPLY_STATUS;
  j.applyErrorTag = process.env.V3_APPLY_ERR_TAG;
  if (j.applyStatus !== "clean") {
    try {
      const tail = fs.readFileSync(process.env.V3_APPLY_LOG_PATH, "utf8").slice(-4000);
      j.applyError = tail;
    } catch {}
  }
  j.v3 = true;
  fs.writeFileSync(out, JSON.stringify(j, null, 2) + "\n");
  console.log(process.env.V3_CELL, j.passed + "/" + j.total, "applyCleanly=" + j.applyCleanly, "status=" + j.applyStatus);
'
rm -f "$TMP_OUT"
