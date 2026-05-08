#!/usr/bin/env bash
# Pre-create N scratch clones for parallel-mode specialist-redo dispatch.
#
# Why scratch clones: `dispatch-specialist-redo-parallel.sh --parallel N` runs
# N cells concurrently. Each cell does `git worktree add` against its target
# clone, which writes to `.git/config`. Multiple concurrent worktree-adds on
# a SHARED .git/config race the config-file lock and fail (smoke 2026-05-08:
# `error: could not lock config file .git/config: File exists`). Giving each
# parallel slot its own clone (with its own `.git/`) eliminates the race.
#
# Layout produced:
#   <out-dir>/<repo-name>-1/    (full git clone of $HOME/dev/<repo-name>)
#   <out-dir>/<repo-name>-2/
#   ...
#   <out-dir>/<repo-name>-N/
#
# Each clone shares blob storage with the source via `--reference` (saves
# disk; ~2 MB per clone vs. ~150 MB for a full copy on a typical repo).
#
# Usage:
#   bash prepare-scratch-clones.sh <repo> <count> <out-dir>
#     <repo>     owner/repo (e.g. szhygulin/vaultpilot-mcp)
#     <count>    number of scratch clones to create
#     <out-dir>  directory to populate
#
# Idempotent: existing `<out-dir>/<repo-name>-<i>/.git/` directories are left
# untouched (a `git fetch` is run to refresh refs). To force-recreate, delete
# the target dir first.

set -euo pipefail

REPO="${1:?usage: prepare-scratch-clones.sh <owner/repo> <count> <out-dir>}"
COUNT="${2:?count required}"
OUT_DIR="${3:?out-dir required}"

NAME="${REPO##*/}"
SOURCE_CLONE="${HOME:-/home}/dev/$NAME"
if [[ ! -d "$SOURCE_CLONE/.git" ]]; then
  # Fallback: this repo's local layout sometimes nests under vaultpilot/.
  # Mirrors #254's clone-path fallback proposal.
  SOURCE_CLONE="${HOME:-/home}/dev/vaultpilot/$NAME"
  if [[ ! -d "$SOURCE_CLONE/.git" ]]; then
    echo "ERROR: no source clone for $REPO at \$HOME/dev/$NAME nor \$HOME/dev/vaultpilot/$NAME." >&2
    exit 1
  fi
fi

mkdir -p "$OUT_DIR"

for i in $(seq 1 "$COUNT"); do
  target="$OUT_DIR/${NAME}-${i}"
  if [[ -d "$target/.git" ]]; then
    echo "[$(date -Iseconds)] reusing $target" >&2
    git -C "$target" fetch --quiet origin 2>/dev/null || \
      echo "  WARN: fetch failed (origin may be missing — fine for replay-only cells)" >&2
    continue
  fi
  echo "[$(date -Iseconds)] cloning $SOURCE_CLONE -> $target" >&2
  # --reference shares blob storage; --shared keeps the dependency. Falls back
  # to a full clone if --reference fails (e.g. on filesystems that don't
  # support hardlinks across boundaries).
  git clone --quiet --reference "$SOURCE_CLONE" "$SOURCE_CLONE" "$target" 2>/dev/null || \
    git clone --quiet "$SOURCE_CLONE" "$target"
done

echo "[$(date -Iseconds)] prepare-scratch-clones: $COUNT clone(s) for $REPO at $OUT_DIR/${NAME}-{1..${COUNT}}" >&2
