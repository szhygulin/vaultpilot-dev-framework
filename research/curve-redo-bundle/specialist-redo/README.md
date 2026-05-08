# curve-redo specialist follow-up — operator scripts

Implementation of the experiment plan in
[`feature-plans/curve-redo-specialist-followup-plan.md`](../../curve-redo-specialist-followup-plan.md)
(merged via [PR #231](https://github.com/szhygulin/vaultpilot-dev-framework/pull/231)).

The four scripts here drive the four execution stages:

| Step | Script | Output |
|------|--------|--------|
| 1. Pick | `pick-specialists.cjs` | `picks.tsv` |
| 2a. Dispatch — serial | `dispatch-specialist-redo.sh <leg>` | `logs-leg<leg>/`, `diffs-leg<leg>/` |
| 2b. Dispatch — parallel | `dispatch-specialist-redo-parallel.sh <leg> --parallel <N>` (requires scratch clones) | same |
| 3. Score (per leg) | `score-specialist-redo.sh <leg>` | `scores-leg<leg>/` |
| 4. Combine + compare | `combine-and-compare.cjs` | `specialist-redo-comparison.json` |

Outputs land under `research/curve-redo-data/specialist-redo/` (gitignored
per `.gitignore`). Override the location with `OUT_DIR=<path>` for the shell
scripts, or `--out`/`--output` for the cjs scripts.

Build first (`npm run build`) — the cjs scripts load `dist/src/...` modules.

## Quick start

```bash
# 1. Pick — emits picks.tsv. Asserts no trim agents.
node research/curve-redo-bundle/specialist-redo/pick-specialists.cjs \
  --corpus research/curve-redo-bundle/corpus.json \
  --out research/curve-redo-data/specialist-redo/picks.tsv

# 2. Smoke a single cell — the dispatch script's --dry-print shows the
#    `vp-dev spawn` command without executing.
bash research/curve-redo-bundle/specialist-redo/dispatch-specialist-redo.sh 1 --dry-print

# 3. Dispatch leg 1 then leg 2 (~30 min each, sequential per agent's clone).
bash research/curve-redo-bundle/specialist-redo/dispatch-specialist-redo.sh 1
bash research/curve-redo-bundle/specialist-redo/dispatch-specialist-redo.sh 2

# 4. Score (~15 min total, ~$20 in Opus K=3 grading).
bash research/curve-redo-bundle/specialist-redo/score-specialist-redo.sh 1
bash research/curve-redo-bundle/specialist-redo/score-specialist-redo.sh 2

# 5. Combine + compare against the merged trim baseline.
node research/curve-redo-bundle/specialist-redo/combine-and-compare.cjs \
  --baseline-leg1-logs   research/curve-redo-data/leg1-baseline/logs-leg1 \
  --baseline-leg1-scores research/curve-redo-data/leg1-baseline/scores-leg1 \
  --baseline-leg2-logs   research/curve-redo-data/leg2-baseline/logs-leg2 \
  --baseline-leg2-scores research/curve-redo-data/leg2-baseline/scores-leg2 \
  --treatment-leg1-logs   research/curve-redo-data/specialist-redo/logs-leg1 \
  --treatment-leg1-scores research/curve-redo-data/specialist-redo/scores-leg1 \
  --treatment-leg2-logs   research/curve-redo-data/specialist-redo/logs-leg2 \
  --treatment-leg2-scores research/curve-redo-data/specialist-redo/scores-leg2 \
  --picks research/curve-redo-data/specialist-redo/picks.tsv \
  --output research/curve-redo-data/specialist-redo/specialist-redo-comparison.json
```

## Parallel dispatch

`dispatch-specialist-redo.sh` runs cells serially (one at a time per leg). The
parallel variant `dispatch-specialist-redo-parallel.sh` runs N cells
concurrently, one per pre-created scratch clone. Each scratch clone has its
own `.git/`, eliminating the `git worktree add` lock contention that breaks
naive parallel-N against a single shared clone (smoke 2026-05-08:
`error: could not lock config file .git/config: File exists`).

```bash
# 1. Create N scratch clones for the target repo (idempotent — safe to re-run).
bash research/curve-redo-bundle/specialist-redo/prepare-scratch-clones.sh \
  szhygulin/vaultpilot-mcp 4 /tmp/specialist-redo-scratch
# → /tmp/specialist-redo-scratch/vaultpilot-mcp-{1..4}

# 2. Parallel dispatch (4 cells in flight at once).
SCRATCH_CLONES_DIR=/tmp/specialist-redo-scratch \
  bash research/curve-redo-bundle/specialist-redo/dispatch-specialist-redo-parallel.sh 1 --parallel 4
```

Per-worker stderr lands at `$OUT_DIR/parallel-worker-<i>.log` for debugging.
Cells distribute round-robin across slots. The serial dispatcher is unchanged
and remains the simpler choice when wall time isn't critical.

Cross-leg parallelism (leg 1 + leg 2 against different target repos
concurrently) was already safe with the serial dispatcher — different clones,
different `.git/`s — and works without modification by running both invocations
in separate shells. The parallel dispatcher solves the harder
within-leg-on-one-clone case.

The parallel dispatcher includes the workaround for [#253](https://github.com/szhygulin/vaultpilot-dev-framework/issues/253)
(`applyReplayRollback` strips `origin` from the shared `.git/config`): origin
is re-added idempotently before each cell so subsequent cells' `git fetch
origin main` doesn't fail.

## Defense-in-depth cost caps

`dispatch-specialist-redo.sh` honors:

* `VP_DEV_MAX_COST_USD` — per-cell cap (default `$10`).
* `MAX_TOTAL_COST_USD` — running-sum cap across the loop (default `$200`).
  Aborts with exit 3 when reached.

`dispatch-specialist-redo-parallel.sh` honors `VP_DEV_MAX_COST_USD` per cell.
The aggregate cap is best-effort in parallel mode (workers update independently);
prefer per-cell caps + total-budget pre-flight estimation over a hard aggregate
abort.

## Trim-contamination assertion

`pick-specialists.cjs` filters all `^agent-916a-trim-` agents out of the
registry view it hands to `pickAgents()` and re-asserts post-pick that no
trim agent slipped through. Exit 1 on violation.
