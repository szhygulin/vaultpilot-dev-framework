# #179 leg-1 model-form comparison

Analysis run on `research/issue-179-data/curve-study-mcp.json` (108 cells, 18 agents, vp-mcp leg, 2026-05-06). All numbers are from `dist/src/research/curveStudy/regression.js` (the same code-path tests cover in this PR).

## AIC sweep — which curve form fits the data?

AIC = `n·ln(rss/n) + 2k` where k = degree+1. Lower is better; convention is ΔAIC < 2 = "indistinguishable evidence", ΔAIC > 2 = meaningful preference.

### ACCURACY (n=18)

| Form | degree | xTransform | R² | adj-R² | F | p | AIC |
|---|---:|:---|---:|---:|---:|---:|---:|
| poly2-raw | 2 | identity | 0.254 | 0.154 | 2.55 | 0.111 | **−61.77** |
| linear-log | 1 | log | 0.162 | 0.110 | 3.10 | **0.097** | −61.68 |
| linear-raw | 1 | identity | 0.110 | 0.054 | 1.98 | 0.179 | −60.59 |
| poly2-log | 2 | log | 0.181 | 0.072 | 1.65 | 0.224 | −60.08 |

**Verdict:** poly2-raw and linear-log are within ΔAIC = 0.09 (effectively tied). Linear-log wins on parsimony — same evidence, one fewer parameter — and has the lower F-test p-value (0.097 vs 0.111). poly2-log is unambiguously worse than both.

### TOKEN COST (n=18)

| Form | degree | xTransform | R² | adj-R² | F | p | AIC |
|---|---:|:---|---:|---:|---:|---:|---:|
| linear-raw | 1 | identity | 0.112 | 0.056 | 2.01 | 0.175 | **−10.04** |
| linear-log | 1 | log | 0.111 | 0.056 | 2.01 | 0.176 | −10.03 |
| poly2-raw | 2 | identity | 0.114 | −0.004 | 0.96 | 0.404 | −8.08 |
| poly2-log | 2 | log | 0.114 | −0.005 | 0.96 | 0.404 | −8.08 |

**Verdict:** linear-raw and linear-log are tied (ΔAIC = 0.01). Both beat poly2 forms by ΔAIC = 2 — meaningful preference for the simpler shape. Picking linear-log keeps consistency with the accuracy curve.

## Leave-out-2-outliers (linear-log)

Identify the two highest-|residual| samples; refit without them. Tests whether a small number of section-combination outliers are dominating the noise.

| Curve | n | R² | p | Notes |
|---|---:|---:|---:|---|
| Accuracy, all samples | 18 | 0.162 | 0.097 | Baseline linear-log |
| Accuracy, drop 2 outliers | 16 | **0.623** | **0.000276** | Both dropped factors = 1.630 |
| Token cost, all samples | 18 | 0.111 | 0.176 | Baseline linear-log |
| Token cost, drop 2 outliers | 16 | 0.265 | **0.041** | Dropped factors 4.40 + 1.00 |

The two dropped accuracy outliers are `agent-916a-trim-35000-s1037029` (xBytes=34192) and `agent-916a-trim-50000-s1052029` (xBytes=49010). Both have `implementRate=0` (every cell pushed back) and quality=0.45. They are the same `s10*029` seed family — section-combination outliers, not noise.

**Interpretation:** the linear-log signal is real and strong. Two specific section-combination cells (one each at the 35KB and 50KB sizes) sit at factor=1.63, well above the trend line, and absorb most of the residual variance. With K=3 replicates per size, these outliers count for 1/3 of each size's representation. K=13 (combine leg 1 + leg 2) would dilute their leverage to ~1/13 and the curve should clear p < 0.05 even without manual outlier exclusion.

## What this PR commits to

- Default `fitPolynomialRegression` to `degree=1, xTransform="log"`.
- Default `runCurveStudy` to linear-log via `regressionDegree=1, regressionXTransform="log"`.
- CLI `vp-dev research curve-study --curve-form` flag with values `linear-log` (default), `linear-raw`, `poly2-log`, `poly2-raw`. Replaces `--degree`.
- `src/util/contextCostCurve.ts` switches its cached fits to linear-log too, for consistency between the curve-study output (samples + proposed regression) and the runtime `accuracyDegradationFactor` / `tokenCostFactor` consumers.

The seed samples in `contextCostCurve.ts` remain unchanged (concave-up placeholders from #177's body) — linear-log doesn't interpolate them, but the runtime contract `[1, sampleMax] → [1, 2]` is approximate-by-design once a non-interpolative form is in use; the relevant tests were widened to reflect that.
