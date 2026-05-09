# Super-agent curve study — leg 1 results

Leg 1 of the Phase C dispatch (see [`super-agent-curve-experiment-plan.md`](../../../feature-plans/super-agent-curve-experiment-plan.md)). 6 trim agents × 13 issues × K=1 = 78 cells, parallel-6 dispatch via [`launch-leg-parallel.sh`](./launch-leg-parallel.sh).

## Run

| | |
|---|---|
| Started | 2026-05-09T07:01:05+01:00 |
| Finished | 2026-05-09T08:07:05+01:00 |
| Wall | 66 min |
| Aggregate cost | **$63.60** |
| Cells | 78/78 |
| Spawner failures | 0 |

## Trims

| Agent | Size (bytes) | Cells | Cost |
|-------|-------------:|------:|-----:|
| agent-super-trim-0-s19 | 0 | 13/13 | $10.46 |
| agent-super-trim-0-s1000022 | 0 | 13/13 | $10.40 |
| agent-super-trim-0-s2000025 | 0 | 13/13 | $10.57 |
| agent-super-trim-408-s427 | 408 | 13/13 | $11.01 |
| agent-super-trim-408-s1000430 | 408 | 13/13 | $11.02 |
| agent-super-trim-408-s2000433 | 408 | 13/13 | $10.15 |

All under the $30 per-process cap.

## Cost distribution vs curve-redo baseline

| Metric | Super leg 1 | Baseline leg 1 | Ratio |
|---|--:|--:|--:|
| n | 78 | 108 | — |
| mean | $0.817 | $0.698 | **1.17×** (gate: <1.5×) |
| median | $0.639 | $0.290 | 2.20× |
| max | $2.04 (capped) | $2.93 | — |
| stdev | — | — | 0.85× |
| total | $63.69 | $75.33 | — |

Median ratio is high because baseline includes many quick pushbacks (issues 156/162/665) at <$0.30, while super-leg-1 has more cells in the implement region (smaller trims still attempt to implement). Mean ratio is the gate-relevant metric.

## Per-issue distribution

| Issue | Super n | Super mean | Super stdev | Decisions |
|---|--:|--:|--:|---|
| 156 | 6 | $0.113 | $0.023 | 6 pushback |
| 157 | 6 | $0.457 | $0.143 | 6 implement |
| 162 | 6 | $0.170 | $0.141 | 6 pushback |
| 168 | 6 | $0.550 | $0.176 | 6 implement |
| 172 | 6 | $1.473 | $0.187 | 6 implement |
| 178 | 6 | $1.068 | $0.262 | 6 implement |
| 180 | 6 | $1.529 | $0.295 | 6 implement |
| **185** | **6** | **$1.838** | **$0.238** | **3 implement / 2 None / 1 error** |
| 186 | 6 | $0.655 | $0.127 | 6 implement |
| 565 | 6 | $0.329 | $0.009 | 6 implement |
| 574 | 6 | $0.755 | $0.284 | 6 implement |
| 649 | 6 | $1.538 | $0.252 | 6 implement |
| 665 | 6 | $0.140 | $0.038 | 6 pushback |

## Issue #185 cap exhaustions

3 of 6 trim seeds on issue #185 hit the per-cell $2 cap before completing the implement step:

| Trim | Decision | isError | Cost | Duration |
|---|---|---|--:|--:|
| agent-super-trim-0-s19 | (none) | true | $2.04 | 593s |
| agent-super-trim-0-s2000025 | error | true | $2.03 | 610s |
| agent-super-trim-408-s427 | (none) | true | $2.04 | 585s |
| agent-super-trim-0-s1000022 | implement | false | $1.61 | 495s |
| agent-super-trim-408-s1000430 | implement | false | $1.50 | 486s |
| agent-super-trim-408-s2000433 | implement | false | $1.81 | 392s |

Issue #185 is a vaultpilot-dev-framework open issue not present in the curve-redo baseline corpus (baseline corpus was vaultpilot-mcp closed-only). Half of the small-trim seeds exhaust budget before producing a final envelope.

**Operator decision recorded for the experiment:** accept the errors as part of the dataset and proceed to leg 2. The judge will score the 3 cap-hit cells per the standard pipeline (likely 0 quality / partial credit depending on the captured diff). Larger-trim legs (2-6) may have a lower error rate on #185 since more context per turn typically reduces total turn count.

## Smoke-check gate verdict

| Gate | Threshold | Actual | Result |
|---|---|---|---|
| Mean cost vs baseline | <1.5× | 1.17× | PASS |
| Cost stdev vs baseline | <1.5× | 0.85× | PASS |
| Error rate | <5% | 3.8% (3/78) | PASS |

Phase C may proceed to leg 2.

## Preliminary error-axis result (legs 1+2 combined)

The combiner now fits an `errorAxis` alongside `qualityAxis` and `costAxis`. Preliminary fit on the 12 trim aggregates available so far (legs 1+2, sizes 0/408/817/1633):

| Form | n | R² | adj-R² | p |
|---|--:|--:|--:|--:|
| degree=1, identity | 12 | 0.306 | 0.237 | 0.062 |
| degree=2, identity | 12 | 0.402 | 0.269 | 0.099 |
| degree=3, identity | 12 | 0.407 | 0.185 | 0.219 |
| degree=1, log | 9 | 0.188 | 0.072 | 0.244 |

Winning form: linear (degree=1, identity), AIC=−82.03, slope ≈ −2.5×10⁻⁵ /byte. Sign matches the user's hypothesis (error rate decays with size); p=0.062 is just above the 0.05 threshold at this sample size.

**Leave-out-N-outliers refit**:
- Drop top-1 residual: p=0.0723, R²=0.315
- Drop top-2 residuals: **p=0.0325, R²=0.455** — significant at p<0.05

The two absorbing outliers were `agent-super-trim-408-s427` (1 error vs the size-408 cluster's 0/0) and `agent-super-trim-0-s1000022` (0 errors at size-0 vs the cluster's 1/1). They sit on the wrong sides of the trend — surface them in the final writeup once legs 3-6 are in.

**By-size error rates so far**:

| Size (B) | n trims | mean error rate | errors / 39 cells |
|---:|---:|---:|---:|
| 0 | 3 | 5.1% | 2 |
| 408 | 3 | 2.6% | 1 |
| 817 | 3 | 0% | 0 |
| 1633 | 3 | 0% | 0 |

Interpretation is preliminary: only 4 distinct sizes resolved so far, error rate likely floors at 0 once size exceeds ~1KB. The full 12-size grid (legs 3-6 add 3266 → 209042B) will reveal whether the curve floors there or if errors creep back in at very large sizes (token-limit cliffs).
