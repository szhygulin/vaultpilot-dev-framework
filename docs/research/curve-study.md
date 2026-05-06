# `vp-dev research curve-study`

Re-fits the two calibration curves in `src/util/contextCostCurve.ts` from a study run:

- `ACCURACY_DEGRADATION_SAMPLES` — outcome-quality factor (how much worse the agent gets at picking the right action as context grows).
- `TOKEN_COST_SAMPLES` — token-budget factor (how many more $/turns per cell the agent burns as context grows).

Phase 3's per-section cost function combines both under explicit weights (default 75% accuracy, 25% cost), AFTER range-normalizing each curve to a common dynamic range:

```
accNorm(x) = 1 + (accuracyDegradationFactor(x)  − 1) / (accuracyMax  − 1)   ∈ [1, 2]
tcNorm(x)  = 1 + (tokenCostFactor(x)            − 1) / (tokenCostMax − 1)   ∈ [1, 2]

contextCostFactor(x) = 0.75 · accNorm(x) + 0.25 · tcNorm(x)
contextCost(section, currentTotalBytes) = bytes(section) × contextCostFactor(currentTotalBytes)
```

The normalization step is non-optional: without it the curve with the larger natural range (accuracy, plausibly 1.0–6.0) dominates the curve with the narrower range (token cost, observed 1.0–1.4) regardless of weights. Stated 75/25 wouldn't match the empirical contribution. After normalization, both curves contribute exactly their weighted share of the [1, 2] composite range.

Re-run when the orchestrator's primary model changes or when calibrating a different specialty class — both curves are model-version- and specialty-specific (#179).

## What the command does

1. Reads an operator-supplied list of pre-trimmed development agents (`--agents-spec`).
2. Dispatches one research-agent run per (devAgent, issue) cell against `--target-repo`, with 4-way parallelism + per-devAgent serialization (each devAgent has its own dedicated clone — protects against the worktree-race failure mode that broke the inaugural run).
3. Aggregates per-cell envelopes from logs.
4. Scores outcome quality per agent using #179's composite (`0.40·implement_rate + 0.25·pushback_accuracy + 0.20·(1−error_max_turns) + 0.15·pr_correctness`).
5. Projects measurements into two sample sets:
   - **Accuracy samples**: `factor = qualityMax / quality(agent)`.
   - **Token-cost samples**: `factor = meanCost(agent) / minMeanCost`, computed over non-error cells.
6. Fits an OLS polynomial regression on each (default degree 2), with F-test + per-coefficient t-tests.
7. **Replace mode**: writes a JSON proposal containing the freshly-measured samples + fitted regression for each curve.
   **Update mode**: merges fresh samples into the existing `ACCURACY_DEGRADATION_SAMPLES` and `TOKEN_COST_SAMPLES` (with collision policy), re-fits, writes proposal.
8. Operator hand-merges both arrays into `src/util/contextCostCurve.ts`. The runtime regressions re-fit lazily on first call.

## Trim methodology — random sampling with K replicates per size

Operator-curated trims (drop sections by judged utility) confound size with which-sections-survive: any "factor changes with size" finding could be the section identity rather than the byte count. A 6KB trim that *always keeps the same 5 sections* tells you about those 5 sections' value, not about the byte budget.

The recommended methodology — implemented by `vp-dev research plan-trims` — is **random sampling with K replicates per target size**. At each size, the planner generates K independent random subsets of the parent's sections that each fit the byte budget. Across the K replicates, every section appears in roughly K/2 trims and is absent from K/2; the regression averages over section identity and recovers the byte-budget effect cleanly.

```
vp-dev research plan-trims \
  --parent agent-916a \
  --sizes 6000,14000,22000,30000,42000,58000 \
  --replicates 5 \
  --output-dir study-trims/ \
  --output-spec study-agents-spec.json
```

Outputs:
- One trimmed `CLAUDE.md` per `(size, replicate)` in `--output-dir`.
- An agents-spec JSON the operator feeds into `curve-study` after registering each generated dev-agent and cloning the target-repo per agent.

`K ≥ 5` is recommended; below that, section-identity variance can swamp the size signal in a low-cell-count regression. With 7 sizes × 5 replicates = 35 dev-agents, plus 3-5 issues per dispatch, expect 100+ cells per study run.

`--preserve <slug,slug>` accepts a list of section IDs that must stay in every trim (e.g. load-bearing safety rules). Any preserved section is a confounder for the size→factor relationship — report what was preserved in the study writeup.

## Modes

### `--mode replace` (default)
The proposal contains only this run's samples. Use when starting from scratch with a new specialty/model — the existing curve is stale and shouldn't anchor the fit.

### `--mode update`
Reads `ACCURACY_DEGRADATION_SAMPLES` and `TOKEN_COST_SAMPLES` from `src/util/contextCostCurve.ts`, merges fresh samples (per-curve), re-fits. Use when adding measurements at sizes the existing curves haven't covered, or when re-measuring at the same sizes after a calibration drift event. Collision policy controls behavior when a fresh sample shares an `xBytes` with an existing sample:

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
  "accuracy": {
    "freshSamples": [...],
    "samples": [
      { "xBytes": 6140,  "factor": 1.0 },
      ...
    ],
    "regression": { ... }
  },
  "tokenCost": {
    "freshSamples": [...],
    "samples": [
      { "xBytes": 6140,  "factor": 1.082 },
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
}
```

The operator copies `accuracy.samples` → `ACCURACY_DEGRADATION_SAMPLES` and `tokenCost.samples` → `TOKEN_COST_SAMPLES` in `src/util/contextCostCurve.ts`, updates the provenance comment with the model version + specialty + R² + F-test p-value for each, and commits. Runtime regressions are re-fitted from the source arrays on first `contextCostFactor()` / `accuracyDegradationFactor()` / `tokenCostFactor()` call — coefficients aren't pasted into source.

### Reading significance

- `significance.fPValue` — overall F-test against the intercept-only null. Below 0.05 means the regression is more than chance; above means the curve isn't doing meaningful work and the operator should either gather more samples or drop a degree.
- `significance.coefficients[i].pValue` — two-sided t-test on coefficient `i`. The highest-degree term's p-value tells you whether the curvature is real. If `coefficients[2].pValue > 0.1` at degree 2, a linear fit (degree 1) likely captures everything.
- `rSquaredAdjusted` — R² penalized for degree. Compare across degrees rather than raw R² to avoid favoring higher-degree fits that just memorize noise.

The CLI prints a `WARNING: overall F-test p-value > 0.05 …` line when the fit isn't statistically significant; downstream callers can read `significance` directly off `getContextCostRegression()`.

## Cost & wall time

Forecast: `cellCount × $6.40` mean (observed in #179's pilot). Use `--parallelism` to trade wall time for concurrency; 4 is the calibrated default that avoids worktree-race contention.

## Inaugural-pilot writeups

Methodology + results from the inaugural pilot are at:
- `feature-plans/issue-179-context-cost-curve.md` — methodology, trim policy, dispatch plan.
- `feature-plans/issue-179-results.md` — vp-mcp pilot per-cell results + open scoring rubrics.
- `feature-plans/issue-179-results-phase2.md` — smoke-test phase 2 results + null-quality finding.

Raw cell envelopes, logs, and per-agent CLAUDE.md trims from the inaugural runs are preserved in git history (commits on the `study/issue-179-pilot` branch through 2026-05-06) but are intentionally not in the working tree — they're machine-generated artifacts that don't belong in source. Phase-3+ research output lives under the gitignored `feature-plans/issue-179-data/` path.
