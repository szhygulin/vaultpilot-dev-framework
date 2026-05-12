#!/usr/bin/env bash
# Score a single TRIM cell with a fresh clone. Adapted from rescore-prose/scripts/score-cell.sh.
#
# Usage: score-cell.sh <cellKey> <diffPath> <issueId> <testsDir> <outJson> [testsDestRelDir]

set -e

CELL=$1
DIFF=$2
ISSUE=$3
TESTS=$4
OUT=$5
DEST=${6:-}

REPO_ROOT=/home/szhygulin/dev/vaultpilot/vaultpilot-dev-framework/.claude/worktrees/b-axis-rank
CLONES=$REPO_ROOT/research/curve-redo-data/v2-scoring/trim/score-clones
CORPUS=$REPO_ROOT/research/curve-redo-bundle/corpus.json

mkdir -p "$CLONES"

# Empty diff = decision=pushback, mark as not-applied (B=0 by convention)
if [ ! -s "$DIFF" ]; then
  echo "{\"passed\":0,\"failed\":0,\"errored\":0,\"total\":0,\"applyCleanly\":false,\"runtimeMs\":0,\"rawOutput\":\"empty diff (decision=pushback)\"}" > "$OUT"
  echo "$CELL EMPTY_DIFF"
  exit 0
fi

META=$(node -e "
const c = JSON.parse(require('fs').readFileSync('$CORPUS','utf8'));
const i = c.issues.find(x => x.issueId === $ISSUE);
if (!i) { console.error('no issue'); process.exit(1); }
console.log(JSON.stringify({sha: i.baseSha || '', repo: i.repo, framework: i.framework, testsDest: i.testsDestRelDir || ''}));
")

SHA=$(echo $META | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).sha)")
REPO=$(echo $META | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).repo)")
FRAMEWORK=$(echo $META | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).framework)")
TESTS_DEST=${DEST:-$(echo $META | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).testsDest)")}

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
  echo "ERROR: no source clone found for $REPO_NAME at $HOME/dev/" >&2
  exit 1
fi

if [ ! -d "$CLONE_DIR/.git" ]; then
  git clone -q "$SRC" "$CLONE_DIR" >&2
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

# Pre-install deps under a global lock (mirrors specialist score-cell.sh)
if [ -f package.json ] && [ ! -d node_modules ]; then
  (
    flock 9
    echo "  installing deps for $CELL ..." >&2
    npm ci --no-audit --no-fund --silent --prefer-offline >/dev/null 2>&1 || \
      npm install --no-audit --no-fund --silent --prefer-offline >/dev/null 2>&1 || true
  ) 9>/tmp/b-axis-rank-npm.lock
fi

cd "$REPO_ROOT"

# Make the diff absolute path before changing directories
DIFF_ABS="$REPO_ROOT/$DIFF"
TESTS_ABS="$REPO_ROOT/$TESTS"
OUT_ABS="$REPO_ROOT/$OUT"

CMD="npm run vp-dev -- research run-tests --diff-path \"$DIFF_ABS\" --tests-dir \"$TESTS_ABS\" --clone-dir \"$CLONE_DIR\" --framework $FRAMEWORK --out \"$OUT_ABS\""
if [ -n "$TESTS_DEST" ]; then
  CMD="$CMD --tests-dest-rel-dir $TESTS_DEST"
fi

eval $CMD >/dev/null 2>&1 || echo "  WARN: run-tests non-zero (preserved at $OUT)" >&2

if [ -s "$OUT_ABS" ]; then
  node -e "const j=JSON.parse(require('fs').readFileSync('$OUT_ABS','utf8')); console.log('$CELL', j.passed+'/'+j.total, 'applyCleanly='+j.applyCleanly);"
else
  echo "$CELL FAILED (no output)"
fi
