#!/usr/bin/env bash
# Super-agent tailored arm — Phase C: dispatch K=3 cells per issue.
#
# Thin wrapper over `dispatch-specialist-redo-parallel.sh`. The specialist
# dispatcher is generic over picks.tsv → only the picks file path and
# OUT_DIR change for the tailored arm. Per-issue agent IDs follow the
# pattern `agent-super-tailored-<issueId>`, written by select-rules.cjs.
#
# Usage:
#   SCRATCH_CLONES_DIR=<path> \
#     bash dispatch-tailored-parallel.sh <leg> --parallel <N> [--dry-print]
#
# Example: SCRATCH_CLONES_DIR=/tmp/tailored-scratch \
#            bash dispatch-tailored-parallel.sh 1 --parallel 4
#
# Required env / flags identical to the specialist wrapper. Differences:
#   * OUT_DIR defaults to research/curve-redo-data/super-agent-tailored
#   * picks.tsv read from $OUT_DIR/picks-tailored.tsv (rendered by Phase A)
#
# All other behavior — K=3, Sonnet 4.6, --dry-run / --no-target-claude-md
# / --skip-summary / --no-registry-mutation, scratch-clone round-robin,
# idempotent skip-if-log-exists, per-cell $2 cap — is identical.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEFAULT_OUT_DIR="$REPO_ROOT/research/curve-redo-data/super-agent-tailored"
export OUT_DIR="${OUT_DIR:-$DEFAULT_OUT_DIR}"

mkdir -p "$OUT_DIR"
PICKS_SRC="$OUT_DIR/picks-tailored.tsv"
PICKS_DST="$OUT_DIR/picks.tsv"
if [[ ! -f "$PICKS_SRC" ]]; then
  echo "ERROR: picks-tailored.tsv not found at $PICKS_SRC — run select-rules.cjs first." >&2
  exit 2
fi
# specialist-redo-parallel.sh reads $OUT_DIR/picks.tsv. Symlink (idempotent).
if [[ -L "$PICKS_DST" ]] && [[ "$(readlink "$PICKS_DST")" == "picks-tailored.tsv" ]]; then
  : # already correct
else
  rm -f "$PICKS_DST"
  ln -s "picks-tailored.tsv" "$PICKS_DST"
fi

exec bash "$REPO_ROOT/research/curve-redo-bundle/specialist-redo/dispatch-specialist-redo-parallel.sh" "$@"
