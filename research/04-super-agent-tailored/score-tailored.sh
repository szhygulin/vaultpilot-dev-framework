#!/usr/bin/env bash
# Super-agent tailored arm — Phase D: score logs.
#
# Thin wrapper over `score-specialist-redo.sh`. Differs only in OUT_DIR.
# Same hidden-test fixtures, same K=3 Opus blind-grade pipeline.
#
# Usage:
#   bash score-tailored.sh <leg>

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEFAULT_OUT_DIR="$REPO_ROOT/research/curve-redo-data/super-agent-tailored"
export OUT_DIR="${OUT_DIR:-$DEFAULT_OUT_DIR}"

exec bash "$REPO_ROOT/research/curve-redo-bundle/specialist-redo/score-specialist-redo.sh" "$@"
