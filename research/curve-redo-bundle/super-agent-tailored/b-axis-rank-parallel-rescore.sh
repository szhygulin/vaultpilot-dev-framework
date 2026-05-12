#!/usr/bin/env bash
# Parallel runner: reads b-axis-rank-cell-manifest.txt and runs b-axis-rank-score-cell.sh on N at a time.
# Run from the worktree root (cd to it first).
PARALLEL=${1:-4}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MANIFEST=$SCRIPT_DIR/b-axis-rank-cell-manifest.txt
SCORE_CELL=$SCRIPT_DIR/b-axis-rank-score-cell.sh
WORKTREE_ROOT=$(cd "$SCRIPT_DIR/../../.." && pwd)

cd "$WORKTREE_ROOT"
mkdir -p logs

cat > /tmp/run-one-cell.sh <<INNER
#!/usr/bin/env bash
IFS='|' read -r issue diff tests out dest <<< "\$1"
cell=\$(basename "\$diff" .diff | sed 's/^agent-//')
logf="logs/score-\${cell}.log"
cd "$WORKTREE_ROOT"
if [ -s "\$out" ]; then
  echo "SKIP \$cell (already scored)"
  exit 0
fi
bash "$SCORE_CELL" "\$cell" "\$diff" "\$issue" "\$tests" "\$out" "\$dest" >"\$logf" 2>&1
if [ -s "\$out" ]; then
  pass=\$(node -e "try { const j=JSON.parse(require('fs').readFileSync('\$out','utf8')); console.log(j.passed); } catch { console.log('?'); }")
  total=\$(node -e "try { const j=JSON.parse(require('fs').readFileSync('\$out','utf8')); console.log(j.total); } catch { console.log('?'); }")
  apply=\$(node -e "try { const j=JSON.parse(require('fs').readFileSync('\$out','utf8')); console.log(j.applyCleanly); } catch { console.log('?'); }")
  echo "DONE \$cell \$pass/\$total apply=\$apply"
else
  echo "FAIL \$cell (no output)"
fi
INNER
chmod +x /tmp/run-one-cell.sh

grep -v '^#' "$MANIFEST" | grep -v '^$' | \
  xargs -P "$PARALLEL" -I LINE /tmp/run-one-cell.sh LINE
