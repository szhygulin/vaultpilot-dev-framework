# curve-redo specialist follow-up — operator scripts

Implementation of the experiment plan in
[`feature-plans/curve-redo-specialist-followup-plan.md`](../../curve-redo-specialist-followup-plan.md)
(merged via [PR #231](https://github.com/szhygulin/vaultpilot-development-agents/pull/231)).

The four scripts here drive the four execution stages:

| Step | Script | Output |
|------|--------|--------|
| 1. Pick | `pick-specialists.cjs` | `picks.tsv` |
| 2. Dispatch (per leg) | `dispatch-specialist-redo.sh <leg>` | `logs-leg<leg>/`, `diffs-leg<leg>/` |
| 3. Score (per leg) | `score-specialist-redo.sh <leg>` | `scores-leg<leg>/` |
| 4. Combine + compare | `combine-and-compare.cjs` | `specialist-redo-comparison.json` |

Outputs land under `feature-plans/curve-redo-data/specialist-redo/` (gitignored
per `.gitignore`). Override the location with `OUT_DIR=<path>` for the shell
scripts, or `--out`/`--output` for the cjs scripts.

Build first (`npm run build`) — the cjs scripts load `dist/src/...` modules.

## Quick start

```bash
# 1. Pick — emits picks.tsv. Asserts no trim agents.
node feature-plans/curve-redo-bundle/specialist-redo/pick-specialists.cjs \
  --corpus feature-plans/curve-redo-bundle/corpus.json \
  --out feature-plans/curve-redo-data/specialist-redo/picks.tsv

# 2. Smoke a single cell — the dispatch script's --dry-print shows the
#    `vp-dev spawn` command without executing.
bash feature-plans/curve-redo-bundle/specialist-redo/dispatch-specialist-redo.sh 1 --dry-print

# 3. Dispatch leg 1 then leg 2 (~30 min each, sequential per agent's clone).
bash feature-plans/curve-redo-bundle/specialist-redo/dispatch-specialist-redo.sh 1
bash feature-plans/curve-redo-bundle/specialist-redo/dispatch-specialist-redo.sh 2

# 4. Score (~15 min total, ~$20 in Opus K=3 grading).
bash feature-plans/curve-redo-bundle/specialist-redo/score-specialist-redo.sh 1
bash feature-plans/curve-redo-bundle/specialist-redo/score-specialist-redo.sh 2

# 5. Combine + compare against the merged trim baseline.
node feature-plans/curve-redo-bundle/specialist-redo/combine-and-compare.cjs \
  --baseline-leg1-logs   feature-plans/curve-redo-data/leg1-baseline/logs-leg1 \
  --baseline-leg1-scores feature-plans/curve-redo-data/leg1-baseline/scores-leg1 \
  --baseline-leg2-logs   feature-plans/curve-redo-data/leg2-baseline/logs-leg2 \
  --baseline-leg2-scores feature-plans/curve-redo-data/leg2-baseline/scores-leg2 \
  --treatment-leg1-logs   feature-plans/curve-redo-data/specialist-redo/logs-leg1 \
  --treatment-leg1-scores feature-plans/curve-redo-data/specialist-redo/scores-leg1 \
  --treatment-leg2-logs   feature-plans/curve-redo-data/specialist-redo/logs-leg2 \
  --treatment-leg2-scores feature-plans/curve-redo-data/specialist-redo/scores-leg2 \
  --picks feature-plans/curve-redo-data/specialist-redo/picks.tsv \
  --output feature-plans/curve-redo-data/specialist-redo/specialist-redo-comparison.json
```

## Defense-in-depth cost caps

`dispatch-specialist-redo.sh` honors:

* `VP_DEV_MAX_COST_USD` — per-cell cap (default `$10`).
* `MAX_TOTAL_COST_USD` — running-sum cap across the loop (default `$200`).
  Aborts with exit 3 when reached.

## Trim-contamination assertion

`pick-specialists.cjs` filters all `^agent-916a-trim-` agents out of the
registry view it hands to `pickAgents()` and re-asserts post-pick that no
trim agent slipped through. Exit 1 on violation.
