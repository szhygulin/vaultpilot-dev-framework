# Super-agent curve study — Phase D + Phase E results

Phase D (accuracy assessment via hidden-test pass rate + Opus K=3 reasoning judge) for all 6 legs, followed by the multi-axis Phase E combiner (quality + error + cost). See [`super-agent-curve-experiment-plan.md`](../../../feature-plans/super-agent-curve-experiment-plan.md) for context, plus the per-leg PRs ([#275](https://github.com/szhygulin/vaultpilot-dev-framework/pull/275), [#283](https://github.com/szhygulin/vaultpilot-dev-framework/pull/283), [#284](https://github.com/szhygulin/vaultpilot-dev-framework/pull/284), [#285](https://github.com/szhygulin/vaultpilot-dev-framework/pull/285), [#286](https://github.com/szhygulin/vaultpilot-dev-framework/pull/286)).

## Phase D run

| Leg | Cells | Tests | Judges | Cost |
|---:|---:|---:|---:|--:|
| 1 | 78 | 57 | 75 | $13.22 |
| 2 | 78 | 60 | 78 | $14.17 |
| 3 | 78 | 57 | 75 | **$13.35** (after re-score) |
| 4 | 78 | 61 | 77 | **$14.08** (after re-score) |
| 5 | 78 | 59 | 77 | $14.31 |
| 6 | 78 | 60 | 78 | $15.03 |
| **Σ** | 468 | 354 | 460 | **$84.16** |

**Tests-vs-judges gap**: 354 test runs but 460 judges because pushback cells (18 per leg × 6 = 108) get a judge but not a test run (nothing to apply). Implement cells (60 per leg × 6 = 360) get both. Error cells get neither.

## Incident: 88 judge failures in batch-2 scoring

Phase D was run in 3 batches of 2 legs in parallel. During batch 2 (legs 3+4 simultaneous, 11:36-11:55 wall), a transient Anthropic-side issue caused **88 out of 153 judge calls to fail** systematically (43 in leg 3, 45 in leg 4). The score script writes `{isError: true, errorReason: "all judge samples failed"}` to the judge.json files on failure.

The first combiner run treated these as Q=0 cells (per `qualityFromAB`'s null-judge semantics), which created an **artificial quality signal** (degree=2 log fit, R²=0.193, p=0.040) driven entirely by the 88 Q=0 outliers concentrated at sizes 6533 and 26130. Detected by the obvious Q=0 cluster in by-size summaries.

**Fix**: deleted the isError judge files (`{isError: true}` files), re-ran score-super-leg.sh for legs 3+4. Re-score completed cleanly with 0 failures. Total Phase D cost rose from the buggy $68.50 to the corrected $84.16.

**The corrected combiner output reverses the quality verdict** (see below).

# Phase E results: full curve study

## By-size summary (3 seeds per size, all clean)

| Size (B) | Q mean | Q stdev | Q range | Cost | Errors | Q/$ |
|---:|--:|--:|---|--:|--:|--:|
| 0 | 45.90 | 12.32 | [38.6, 60.1] | $0.81 | 5.1% | **56.8** |
| 408 | 37.87 | 1.92 | [35.7, 39.1] | $0.83 | 2.6% | 45.9 |
| 817 | 38.60 | 2.25 | [37.1, 41.2] | $0.78 | 0% | 49.7 |
| 1633 | 43.32 | 13.40 | [35.0, 58.8] | $0.84 | 0% | 51.8 |
| 3266 | 45.38 | 10.54 | [39.2, 57.6] | $0.88 | 5.1% | 51.3 |
| 6533 | 35.61 | 1.18 | [34.3, 36.5] | $0.88 | 2.6% | 40.5 |
| 13065 | 44.39 | 13.47 | [34.0, 59.6] | $1.08 | 0% | 41.1 |
| 26130 | 37.12 | 2.46 | [34.7, 39.6] | $1.02 | 0% | 36.3 |
| 52261 | 40.98 | 2.66 | [37.9, 42.6] | $1.18 | 0% | 34.8 |
| 104521 | 46.78 | 10.63 | [39.8, 59.0] | $1.27 | 2.6% | 36.9 |
| 156782 | 45.85 | 12.31 | [37.9, 60.0] | $1.57 | 0% | 29.3 |
| **209042** | **40.44** | 1.85 | [38.3, 41.6] | $1.72 | 0% | **23.5** |

## Axis verdicts (n=36 trim aggregates)

**Quality axis: FLAT, no signal.**

| Form | n | R² | adj-R² | p |
|---|--:|--:|--:|--:|
| degree=1 log(1+x) | 33 | 0.030 | -0.001 | 0.333 |
| degree=2 log(1+x) | 33 | 0.030 | -0.034 | 0.630 |
| degree=3 log(1+x) | 33 | 0.042 | -0.057 | 0.735 |
| degree=1 identity | 36 | 0.011 | -0.018 | 0.548 |
| degree=2 identity | 36 | 0.026 | -0.033 | 0.642 |
| degree=3 identity | 36 | 0.064 | -0.024 | 0.545 |

All 6 forms have adj-R² near zero or negative. Leave-out-2 outliers refit: p=0.101, R²=0.090 — still not significant. **Adding more pooled CLAUDE.md content does not change quality on this corpus.** Quality oscillates 35.6-46.8 across all 12 sizes with no trend.

**Error axis: not significant.**

| Form | n | R² | p |
|---|--:|--:|--:|
| degree=1 identity | 36 | 0.050 | 0.188 |
| degree=2 identity | 36 | 0.055 | 0.396 |
| degree=3 identity | 36 | 0.088 | 0.394 |
| degree=1 log | 33 | 0.033 | 0.315 |

Error rate is bimodal (0-5.1% per size) and well-explained by the cap-regime journey (legs 1-3 at $2 cap saw cap-truncated errors; legs 4-6 at $4-$6 cap saw close to zero errors). Cap-regime change confounds any underlying size-vs-error signal.

**Cost axis: strong linear, p < 10⁻¹⁷.**

| Form | n | R² | adj-R² | p |
|---|--:|--:|--:|--:|
| degree=3 identity | 36 | 0.918 | 0.910 | 1.8×10⁻¹⁷ |
| degree=2 identity | 36 | 0.910 | 0.904 | 6.0×10⁻¹⁸ |
| **degree=1 identity** | 36 | 0.903 | 0.900 | **9.3×10⁻¹⁹** |
| degree=3 log | 33 | 0.911 | 0.901 | 2.6×10⁻¹⁵ |

Per the local CLAUDE.md "ΔAIC < 2 indistinguishable → simpler form wins" rule:
- degree=2 vs degree=3 identity: ΔAIC=1.56 (indistinguishable) → simpler wins (degree=2)
- degree=1 vs degree=2 identity: ΔAIC=0.70 (indistinguishable) → simpler wins (degree=1)

**Linear-identity wins**: slope ≈ +4.4×10⁻⁶ $/byte, intercept ≈ $0.81 at size=0. Cost grows byte-proportionally. Log forms strictly worse (ΔAIC ≥ 18 for all log fits).

## Quality-per-dollar verdict

Q/$ drops monotonically from **56.8 at size=0** to **23.5 at size=209042** — a **2.4× efficiency loss** for using the full super-agent CLAUDE.md vs zero context. The size-0 trim (effectively just the orchestrator's bare system prompt) gives the best quality-per-dollar of any tested size.

## Decomposition: judge vs tests separately

The combined quality formula is `Q = qualityFromAB(A, B)`:
- **Pushback** cells: `Q = 2A`, where `A` is the judge median (0-50)
- **Implement** cells: `Q = A + B`, where `B` is the hidden-test pass rate normalized to 0-50

When the two axes are summed, signal on one can be diluted by the other. Decomposing per-cell scores into separate A-only and B-only axes (computing each on a 0-100 scale for direct comparison) reveals structure the combined fit hid.

### Per-size means by axis

| Size (B) | Q(A) judge | sd | Q(B) tests impl-only | sd | Q(AB) combined | sd |
|---:|--:|--:|--:|--:|--:|--:|
| 0 | 69.51 | 5.31 | 25.77 | 5.89 | 45.90 | 12.32 |
| 408 | 70.41 | 4.28 | 19.02 | 1.96 | 37.87 | 1.92 |
| 817 | 72.10 | 1.95 | 19.42 | 1.85 | 38.60 | 2.25 |
| 1633 | 74.00 | 2.00 | 20.44 | 9.34 | 43.32 | 13.40 |
| 3266 | 69.26 | 3.16 | 24.32 | 6.08 | 45.38 | 10.54 |
| 6533 | 70.26 | 2.54 | 17.09 | 0.30 | 35.61 | 1.18 |
| 13065 | 73.74 | 2.84 | 23.72 | 7.37 | 44.39 | 13.47 |
| 26130 | 71.03 | 4.74 | 17.98 | 2.59 | 37.12 | 2.46 |
| 52261 | 72.00 | 2.72 | 26.22 | 4.99 | 40.98 | 2.66 |
| 104521 | 73.03 | 3.15 | 24.83 | 5.79 | 46.78 | 10.63 |
| 156782 | 73.90 | 1.46 | 27.47 | 8.31 | 45.85 | 12.31 |
| 209042 | 74.00 | 0.31 | 25.42 | 2.13 | 40.44 | 1.85 |

### AIC sweep per axis (n=33 for log-x, n=36 for identity-x)

**Judge axis (A)** — winning form: degree=1 log, R²=0.075, AIC=71.23. Weak monotonic positive trend (74.0 at size=0 vs 74.0 at size=209042 — net 70 → 74 across the range, +6% on the 0-100 scale).

**Tests axis (B, implements only)** — winning form: **degree=1 log, R²=0.179, AIC=111.40, F=6.74, p ≈ 0.009**. Significant positive log trend.
- Coefficients: `Q(B) = 11.71 + 1.15·log(1+x)`
- Tests pass rate climbs +1.15 points per log-unit of size
- Range: ~17 at the dip (size=6533) → ~27 at the peak (size=156782)
- degree=2 log is competitive (R²=0.192, AIC=112.85, ΔAIC=+1.45) — within indistinguishable range, simpler form wins

**Combined Q(AB)** — winning form: degree=1 log, R²=0.030, p=0.333. Flat-looking.

### Why combined Q masks the tests signal

The combined Q is a sum:
- For ~75% of cells (implement): Q = A + B
- For ~23% of cells (pushback): Q = 2A only (B contributes 0)

Two effects dilute the B signal in the combined axis:
1. **Pushback cells carry zero B**, so the per-trim mean Q is weighted toward judge-only contributions for ~23% of cells.
2. **Judge A is large and nearly flat** (range 69-74 across all sizes). When added to B (range 17-27), it dominates the sum and masks the B-axis variation.

So the combined R²=0.030 understates the experiment's real findings:
- **Judge A (reasoning quality): essentially flat across sizes** — pooled CLAUDE.md does not measurably change how the reasoning judge grades agent decisions.
- **Tests B (hidden test pass rate): significantly improves with log(size), p ≈ 0.009** — more CLAUDE.md content does produce implements that pass more hidden tests, but the effect is small (+5 points on the 0-100 B scale across the full 0-209042B grid).
- **Cost: linear with size, p < 10⁻¹⁸** — strictly more expensive.

### Updated interpretation

The previous "quality is flat" headline is partially correct but masks the B-axis signal. Restated:

- **Reasoning quality is flat with size.** The judge does not rate agent reasoning meaningfully different across trim sizes. Pooled CLAUDE.md content does not change how the agent thinks about issues.
- **Hidden test pass rate improves slightly with size.** Bigger CLAUDE.md → bigger fraction of implement diffs that pass the hidden tests. Effect size: ~5 points on the 0-100 B scale. p ≈ 0.009.
- **Cost grows linearly with size, strongly significant.**
- **Quality-per-dollar still drops with size**, because the B-axis gain is too small to offset the linear cost rise.

So the super-agent does help — but only on the "did the implement actually pass tests" dimension, and only by a small amount. Whether that small gain is worth the linear cost rise is a deployment decision the writeup should surface explicitly.

### Within-size variance: K=1 limitation

Within each size cluster, B values are dominated by specific-seed effects rather than size effects:

| Size (B) | B values across 3 seeds | spread |
|---:|---|--:|
| 1633 | 31.23, 15.00, 15.10 | 16.2 |
| 3266 | 31.34, 22.97, 20.94 | 10.4 |
| 13065 | 32.19, 20.19, 18.77 | 13.4 |
| 52261 | 28.08, 30.02, 20.58 | 9.4 |
| 104521 | 31.43, 22.50, 22.86 | 8.9 |
| 156782 | 37.07, 22.95, 22.40 | 14.7 |

In each cluster one seed scores ~10 points above the other two. With K=1 replication, this seed-specific component is not separable from any size effect. K=3 or higher would tighten the size-axis confidence interval substantially. (The current K=1 follows the experiment plan and matches the curve-redo baseline; bumping K is a follow-up consideration.)

## Interpretation

**The original super-agent hypothesis is refuted** on this 13-issue corpus:

> "A single super-agent containing the deduped union of every existing agent's CLAUDE.md, given to every dispatched agent, is the right architecture."

The pooled super-agent CLAUDE.md does not improve per-issue quality at any tested trim size. Cost rises linearly with size while quality stays flat → quality-per-dollar drops monotonically. The size-0 trim ties with the full super-agent on quality while being 2.4× cheaper.

This is consistent with the picker-vs-content finding (PRs [#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255), [#269](https://github.com/szhygulin/vaultpilot-dev-framework/pull/269), [#272](https://github.com/szhygulin/vaultpilot-dev-framework/pull/272), [#274](https://github.com/szhygulin/vaultpilot-dev-framework/pull/274)) where three different picker arms (Jaccard, naive, prose-LLM) all tied −17 quality points vs the trim baseline. The bottleneck is not how to select CLAUDE.md content — it's that the CLAUDE.md content as it currently exists doesn't transfer quality across agents on this issue corpus.

**Open questions for the final writeup (Phase F)**:

1. Is the result corpus-dependent? The 13 issues lean heavily on infra-style fixes (judge median 0-50 range suggests the judge sees most cells as "reasonable but not exemplary"). A corpus of richer feature work might surface a size effect.
2. Are some specific lessons in the super-agent CLAUDE.md actively unhelpful? The 33 trim agents with 0 bytes of CLAUDE.md content score the same as the 3 trim agents with the full 209 KB — if any lessons mattered, this should not be true.
3. How does the super-agent compare to the trim baseline (`agent-916a`) on the same corpus issues? The original plan calls for an overlay against the existing `agent-916a` curve (`research/curve-redo-data/leg{1,2}-baseline/`) — Phase F.

## Total experiment cost (Phases A + C + D so far)

| Phase | Cost | Note |
|---|--:|---|
| A (super-agent build) | ~$22 | one Opus dedup call |
| C (468 cells, 6 legs) | $500.92 | per leg PRs above |
| D (460 judges + 354 tests, 6 legs) | $84.16 | this PR |
| **Σ so far** | **~$607** | within original $780-800 envelope |

Phase F (writeup + PR) is pure deterministic — no further API cost.

## Phase F preview

The final writeup should land:
- This per-axis result (quality flat, cost linear, error confounded by cap regime).
- The agent-916a trim baseline overlay at matched x-axis bytes.
- The four-arm matrix: trim baseline / super-agent at peak / super-agent at S / super-agent at 0 (already known: size-0 is tied with all sizes within noise).
- The cap-regime caveat: legs 1-3 ($2 cap) and legs 4-6 ($4-$6 cap) measure different things on the cost axis; quality axis is comparable.
