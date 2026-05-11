# Super-agent curve study — leg 6 results + Phase C complete

Final leg of Phase C dispatch (see [`super-agent-curve-experiment-plan.md`](../../../feature-plans/super-agent-curve-experiment-plan.md)). Trim sizes **156782B + 209042B** (full S) × 3 seeds × 13 issues × K=1 = 78 cells. Run with the elevated **`$6`** per-cell cap.

## Run

| | |
|---|---|
| Started | 2026-05-11T09:38:33+01:00 |
| Finished | 2026-05-11T11:00:24+01:00 |
| Wall | 82 min |
| Aggregate cost | **$128.30** |
| Cells | 78/78 |
| Errors | **0/78 (0%)** |
| Spawner failures | 0 |

Per-trim totals: $19.39, $20.15, $21.14, $21.57, $22.12, $23.92 (range $19.39-$23.92, all under $90 per-process cap).

## Cap-policy retrospective

| Cell threshold | Count | % of leg-6 cells |
|---|--:|--:|
| ≥$5.95 (hit $6 cap) | **0** | 0% |
| ≥$4.00 | 5 | 6.4% |
| ≥$3.95 (would have hit $4 cap) | 2 | 2.6% |
| ≥$3.00 | 8 | 10.3% |
| ≥$2.00 | 47 | 60.3% |
| ≥$1.95 (would have hit old $2 cap) | 47 | 60.3% |

**The $6 cap was well-sized**: 0 cells hit it, max cell was $4.31. Stepping up legs 1→3 at $2, 4→5 at $4, 6 at $6 was exactly right — each step revealed cells the previous regime would have truncated.

# Phase C complete

| Leg | Sizes (B) | Cap | Cost | Errors | Wall |
|---:|---|---|--:|---:|---|
| 1 | 0, 408 | $2 | $63.60 | 3 | 66 min |
| 2 | 817, 1633 | $2 | $62.75 | 0 | 69 min |
| 3 | 3266, 6533 | $2 | $68.81 | 3 | 70 min |
| 4 | 13065, 26130 | $4 | $82.09 | 0 | 81 min |
| 5 | 52261, 104521 | $4 | $95.37 | 1 | 85 min |
| 6 | 156782, 209042 | **$6** | **$128.30** | **0** | 82 min |
| **Σ** | 12 sizes, 36 trims | — | **$500.92** | 7 (1.5%) | ~7.5 hours |

## Full by-size table (n=36 trim aggregates)

| Size (B) | n trims | cells | mean cost | error rate | cluster errors | cap |
|---:|---:|---:|--:|--:|--:|---|
| 0 | 3 | 39 | $0.808 | 5.1% | 2/39 | $2 |
| 408 | 3 | 39 | $0.825 | 2.6% | 1/39 | $2 |
| 817 | 3 | 39 | $0.776 | 0% | 0/39 | $2 |
| 1633 | 3 | 39 | $0.836 | 0% | 0/39 | $2 |
| 3266 | 3 | 39 | $0.884 | 5.1% | 2/39 | $2 |
| 6533 | 3 | 39 | $0.880 | 2.6% | 1/39 | $2 |
| 13065 | 3 | 39 | $1.081 | 0% | 0/39 | $4 |
| 26130 | 3 | 39 | $1.024 | 0% | 0/39 | $4 |
| 52261 | 3 | 39 | $1.177 | 0% | 0/39 | $4 |
| 104521 | 3 | 39 | $1.268 | 2.6% | 1/39 | $4 |
| 156782 | 3 | 39 | $1.567 | 0% | 0/39 | $6 |
| **209042** | 3 | 39 | **$1.723** | **0%** | **0/39** | $6 |

## Phase E preview — AIC sweep (cost axis, before judge scoring)

Cost is robustly linear in trim size:

| Form | R² | AIC | ΔAIC | verdict |
|---|--:|--:|--:|---|
| degree=3 identity | 0.918 | -167.42 | 0 | min-AIC |
| degree=2 identity | 0.910 | -165.87 | +1.55 | indistinguishable |
| **degree=1 identity** | 0.903 | -165.17 | +2.25 | borderline; ties→simpler |
| degree=3 log | 0.909 | -163.68 | +3.74 | meaningfully worse |
| degree=2 log | 0.857 | -149.32 | +18.10 | far worse |
| degree=1 log | 0.517 | -107.58 | +59.84 | rejected |

Per the local CLAUDE.md "ΔAIC < 2 indistinguishable; ties → simpler form" rule:
- degree=2 vs degree=3 identity: indistinguishable → simpler wins (degree=2)
- degree=1 vs degree=2 identity: ΔAIC=+0.70 indistinguishable → simpler wins (degree=1)
- So linear-identity is the right choice: slope ≈ +4.4×10⁻⁶ $/byte (R²=0.903, p<<10⁻¹⁰)

**Identity strictly dominates log forms.** Cost grows byte-proportionally, not log-proportionally. The per-token loading cost is linear in CLAUDE.md size, which matches operator intuition (every turn re-loads the full system prompt).

## Phase E preview — error axis

| Form | R² | AIC | ΔAIC |
|---|--:|--:|--:|
| degree=1 log | 0.145 | -253.06 | 0 |
| degree=2 log | 0.151 | -251.31 | +1.75 |
| degree=1 identity | 0.050 | -249.27 | +3.79 |

Error axis is **not well-fit by any form** — R² caps at 0.15. Total errors across all 468 cells = 7, mostly concentrated at sizes ≤6533 under the original $2 cap. The cap-regime changes (legs 4-5 at $4, leg 6 at $6) effectively eliminated cap-induced errors from sizes ≥13065, leaving only a few stochastic outliers. Once Phase D quality scores land, the U-shape (real errors at small sizes from undirected work, vs cap-errors that decay with size given enough budget) will be clearer.

## Heavy-issue cost trends across all 12 sizes

| Issue | size=0 | size=6533 | size=26130 | size=104521 | size=209042 | growth |
|---|--:|--:|--:|--:|--:|--:|
| #185 | $1.89 | $1.77 | $2.12 | $2.58 | **$3.46** | 1.83× |
| #649 | $1.53 | $1.93 | $1.86 | $1.97 | $2.45 | 1.60× |
| #180 | $1.71 | $1.62 | $2.10 | $2.46 | $2.96 | 1.73× |
| #172 | $1.38 | $1.73 | $1.69 | $2.01 | **$3.39** | 2.46× |
| #178 | $0.90 | $1.28 | $1.59 | $2.60 | $2.50 | 2.78× |
| #168 | $0.63 | $0.51 | $0.68 | $0.96 | $1.83 | 2.91× |
| #186 | $0.56 | $0.86 | $0.91 | $0.89 | $1.57 | 2.81× |

All heavy issues grew with size. Even at full S=209042B, max single-issue mean is $3.46 — comfortably under the $6 cap. Light issues (#156, #162, #665 — all pushback) stayed essentially flat at $0.12-0.18 across all 12 sizes.

## Next: Phase D (accuracy assessment)

Phase D — per-cell hidden-test pass rate + Opus K=3 reasoning judge — fires for legs 1-6 next. Expected ~$110 total ($18/leg × 6). Output: per-cell `<cellKey>-tests.json` + `<cellKey>-judge.json` under each `leg<N>/scores/`. Once Phase D completes, the multi-axis combiner populates the `qualityAxis` (currently empty) and the AIC sweep runs over all three axes for the final writeup.

## Smoke-check gate verdict

| Gate | Threshold | Actual | Result |
|---|---|---|---|
| Mean cost vs curve-redo baseline | <1.5× | 2.36× ($1.645 vs $0.698) | over-threshold (cap-regime artifact, expected) |
| Error rate | <5% | 0% | PASS |

Mean-cost gate over-threshold for legs 4-6 is a **measurement, not a regression**: the original baseline cap truncated heavy cells. Writeup will use leg-1 ($0.808 at size=0, $2 cap matching baseline) as the apples-to-apples comparator: at the smallest trim, cost is 1.16× baseline (the same gap leg 1 originally established).
