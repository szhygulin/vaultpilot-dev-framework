# `vp-dev research curve-study`

Re-fits `src/util/contextCostCurve.ts` (CLAUDE.md size → `accuracyDegradationFactor`) for a chosen development-agent specialty + model tier. Re-run when the orchestrator's primary model changes or when calibrating a different specialty class — the curve is model-version- and specialty-specific (#179).

## What the command does

1. Reads an operator-supplied list of pre-trimmed development agents (`--agents-spec`).
2. Dispatches one research-agent run per (devAgent, issue) cell against `--target-repo`, with 4-way parallelism + per-devAgent serialization (each devAgent has its own dedicated clone — protects against the worktree-race failure mode that broke the inaugural run).
3. Aggregates per-cell envelopes from logs.
4. Scores outcome quality per agent using #179's composite (`0.40·implement_rate + 0.25·pushback_accuracy + 0.20·(1−error_max_turns) + 0.15·pr_correctness`).
5. Projects scores into samples (sizeBytes → factor), where `factor = qualityMax / quality`.
6. **Replace mode**: writes a JSON proposal containing the freshly-measured samples + a fitted OLS polynomial regression.
   **Update mode**: merges fresh samples into the existing `CONTEXT_COST_SAMPLES` (with collision policy), re-fits, writes proposal.
7. Operator hand-merges `samples` into `CONTEXT_COST_SAMPLES`. The runtime regression at `contextCostFactor()` re-fits on first call.

## Why operator-input trims (not algorithmic)

A trim is a judgment about which CLAUDE.md sections still earn their bytes. Encoding that as an algorithm would either over-trim load-bearing rules or under-trim by being too cautious. The operator supplies N pre-trimmed CLAUDE.mds; this tool measures what those trims do.

## Modes

### `--mode replace` (default)
The proposal contains only this run's samples. Use when starting from scratch with a new specialty/model — the existing curve is stale and shouldn't anchor the fit.

### `--mode update`
Reads `CONTEXT_COST_SAMPLES` from `src/util/contextCostCurve.ts`, merges fresh samples, re-fits. Use when adding measurements at sizes the existing curve hasn't covered, or when re-measuring at the same sizes after a calibration drift event. Collision policy controls behavior when a fresh sample shares an `xBytes` with an existing sample:

- `replace-on-collision` (default): newer wins.
- `average-on-collision`: split the difference.
- `keep-both`: retain duplicates (rare; useful for variance studies but produces a degenerate fit unless `--degree` is high enough).

## Inputs

### `--agents-spec <path>` — required JSON

```json
[
  { "devAgentId": "agent-9180", "sizeBytes": 6140,  "clonePath": "/tmp/study-clones/clone-1" },
  { "devAgentId": "agent-9181", "sizeBytes": 10255, "clonePath": "/tmp/study-clones/clone-2" },
  { "devAgentId": "agent-9182", "sizeBytes": 14300, "clonePath": "/tmp/study-clones/clone-3" }
]
```

Each entry must:
- Already be registered (`vp-dev agents list` to verify).
- Have its CLAUDE.md trimmed and committed to `agents/<devAgentId>/CLAUDE.md`.
- Have a dedicated clone of `--target-repo` at `clonePath`. Cross-agent isolation prevents worktree races.

### `--rubrics <path>` — optional JSON

After the dispatch finishes you usually want to score pushback comments and PR bodies for substance. Score 0/1 per cell:

```json
[
  { "agentId": "agent-9180", "issueId": 50, "pushbackAccuracy": 1, "prCorrectness": 0 },
  { "agentId": "agent-9180", "issueId": 52, "pushbackAccuracy": 0 }
]
```

Without rubrics, the tool defaults to "outcome bucket = right answer" (1 if outcome=pushback for pushback-accuracy, 1 if outcome=implement for PR-correctness). Provisional only.

### `--degree <n>`

OLS polynomial regression degree. Default `2` (quadratic — fits the expected concave-up shape: factor accelerates with size). Increase only if you have ≥ 6 samples and visible higher-order curvature in the data; otherwise you're overfitting.

## Output

```
{
  "generatedAt": "2026-05-06T...",
  "mode": "update",
  "targetRepo": "szhygulin/vaultpilot-mcp-smoke-test",
  "issues": [50, 52, 54],
  "agents": [...],
  "cellCount": 28,
  "totalCostUsd": 178.42,
  "wallMs": 5102000,
  "scores": [...],
  "freshSamples": [...],
  "samples": [
    { "xBytes": 6140,  "factor": 1.0 },
    { "xBytes": 10255, "factor": 1.05 },
    ...
  ],
  "regression": {
    "degree": 2,
    "coefficients": [c0, c1, c2],
    "xMean": ...,
    "xStd": ...,
    "n": 10,
    "rss": ...,
    "tss": ...,
    "rSquared": 0.94,
    "rSquaredAdjusted": 0.92,
    "significance": {
      "fStatistic": 41.7,
      "fDfRegression": 2,
      "fDfResidual": 7,
      "fPValue": 1.3e-4,
      "coefficients": [
        { "estimate": ..., "standardError": ..., "tStatistic": ..., "pValue": ... }
      ],
      "residualStdError": ...
    }
  }
}
```

The operator copies `samples` into `CONTEXT_COST_SAMPLES` in `src/util/contextCostCurve.ts`, updates the provenance comment with the model version + specialty + R² + F-test p-value, and commits. The runtime regression is re-fitted from `CONTEXT_COST_SAMPLES` on first `contextCostFactor()` call — coefficients aren't pasted into source.

### Reading significance

- `significance.fPValue` — overall F-test against the intercept-only null. Below 0.05 means the regression is more than chance; above means the curve isn't doing meaningful work and the operator should either gather more samples or drop a degree.
- `significance.coefficients[i].pValue` — two-sided t-test on coefficient `i`. The highest-degree term's p-value tells you whether the curvature is real. If `coefficients[2].pValue > 0.1` at degree 2, a linear fit (degree 1) likely captures everything.
- `rSquaredAdjusted` — R² penalized for degree. Compare across degrees rather than raw R² to avoid favoring higher-degree fits that just memorize noise.

The CLI prints a `WARNING: overall F-test p-value > 0.05 …` line when the fit isn't statistically significant; downstream callers can read `significance` directly off `getContextCostRegression()`.

## Cost & wall time

Forecast: `cellCount × $6.40` mean (observed in #179's pilot). Use `--parallelism` to trade wall time for concurrency; 4 is the calibrated default that avoids worktree-race contention.

## Inaugural dataset

The seed dataset for the curve currently in source lives in `feature-plans/issue-179-data/`. See `feature-plans/issue-179-context-cost-curve.md` for the methodology writeup and `feature-plans/issue-179-results.md` for the operator-judged scoring tables.
