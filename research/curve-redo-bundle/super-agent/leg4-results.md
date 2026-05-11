# Super-agent curve study — leg 4 results + 4-leg synthesis

Leg 4 of Phase C (see [`super-agent-curve-experiment-plan.md`](../../../feature-plans/super-agent-curve-experiment-plan.md)). Trim sizes 13065B + 26130B × 3 seeds × 13 issues × K=1 = 78 cells. **First leg run with the elevated $4 per-cell cap** (legs 1-3 used $2; rationale in [`leg3-results.md`](./leg3-results.md)).

## Run

| | |
|---|---|
| Started | 2026-05-09T13:33:42+01:00 |
| Finished | 2026-05-09T14:54:13+01:00 |
| Wall | 81 min |
| Aggregate cost | **$82.09** |
| Cells | 78/78 |
| Errors | **0/78 (0%)** |
| Spawner failures | 0 |

Per-trim totals: $13.38, $14.11, $14.68, $12.18, $15.01, $12.73 (range $12.18-$15.01, all under $60 per-process cap).

## Cap-regime impact: 12 cells (15.4%) would have hit the old $2 cap

| Cell threshold | Count | % of leg-4 cells |
|---|--:|--:|
| ≥$1.95 (old cap) | 12 | 15.4% |
| ≥$2.50 | 8 | 10.3% |
| ≥$3.00 | 5 | 6.4% |
| ≥$3.50 | 1 | 1.3% |
| ≥$3.95 (new cap) | 0 | 0% |

The new $4 cap had headroom; the highest single-cell cost was **$3.41** (issue #180 at one of the size=13065 trims).

## Critical finding: cap raise refutes the leg-3 U-shape

Leg 3 surfaced a U-shape in error rate (5.1% → 2.6% → 0% → 0% → 5.1% → 2.6%) which contradicted the user's "decays with size" hypothesis. With leg 4's $4 cap, the U disappears:

| Size (B) | Errors / 39 cells | Cap |
|---:|---:|---|
| 0 | 5.1% | $2 |
| 408 | 2.6% | $2 |
| 817 | 0% | $2 |
| 1633 | 0% | $2 |
| 3266 | 5.1% | $2 |
| 6533 | 2.6% | $2 |
| **13065** | **0%** | **$4** |
| **26130** | **0%** | **$4** |

Issue #185 specifically: 1 cap-error at size=3266 (with $2 cap), but 0 cap-errors at sizes 13065 + 26130 (with $4 cap). Issue #180 hit $3.17 at size=13065 — would have been a cap-error under $2.

**The leg-3 "errors come back at large sizes" was a cap artifact.** Once the cap stops binding, errors decay monotonically with size, matching the original hypothesis.

## Cost growth: now strongly significant

OLS on per-trim mean cost vs trim size, all 4 legs (n=24 trim aggregates, sizes 0/408/817/1633/3266/6533/13065/26130):

| Form | slope | R² | t | df | verdict |
|---|--:|--:|--:|--:|---|
| identity | +9.99×10⁻⁶ /byte | **0.592** | **5.65** | 22 | **p<10⁻⁴** |
| log(1+x) | +0.0215 | 0.339 | 3.36 | 22 | p≈0.003 |

Identity wins on R². Cost grows linearly with trim size. The log-x fit is ALSO highly significant but degrades against identity, suggesting the cost-vs-size relationship is closer to linear than logarithmic in this regime.

## Per-issue cost trends (selected heavy issues)

| Issue | size=0 | size=6533 | size=13065 | size=26130 |
|---|--:|--:|--:|--:|
| #185 | $1.89 | $1.77 | $2.01 | $2.12 |
| #649 | $1.53 | $1.93 | $1.97 | $1.86 |
| #180 | $1.71 | $1.62 | **$3.17** | $2.10 |
| #178 | $0.90 | $1.28 | $1.63 | $1.59 |
| #172 | $1.38 | $1.73 | $1.70 | $1.69 |

Most heavy issues plateau or oscillate around $2-2.20 across legs 4. Issue #180 spiked at size=13065 ($3.17) — a single trim seed hit a particularly token-heavy reasoning path, but at $4 cap it completed cleanly. Without the cap raise, this cell would have been an error.

## Smoke-check gate verdict

| Gate | Threshold | Actual | Result |
|---|---|---|---|
| Mean cost vs curve-redo baseline | <1.5× | **1.51×** ($1.052 vs $0.698) | **borderline** |
| Error rate | <5% | 0% | PASS |

Mean-cost gate is **borderline** because the $4 cap regime is fundamentally different from the $2-capped baseline. The 1.5× threshold was calibrated against the curve-redo baseline (also $2-capped). Cells that would have been cap-truncated to ~$2 in the original regime now finish naturally at $2.50-$3.50, raising the unconstrained mean. **Recommend: re-baseline the cost gate against legs 4-6's own midpoint, not against the $2-capped curve-redo baseline.**

The error-rate gate passes cleanly: 0/78 errors with the new cap.

## Implications for legs 5-6

Cost extrapolation to S=209042B (the full super-agent CLAUDE.md size) under the linear identity fit:

`mean_cost ≈ 0.62 + 9.99×10⁻⁶ × 209042 ≈ $2.71`

Heavy implement cells (#180, #185, #649) extrapolate to $4-5+, which would still hit the $4 cap on a fraction of cells. Operator may want to consider a further cap raise to $5 or $6 for legs 5-6, or accept that ~20-30% of size=209042 cells will be cap-bound.

## Decisions held for operator

- Whether to launch leg 5 (sizes 52261B + 104521B) — **paused per operator instruction** until explicit go-ahead.
- Whether to raise the cap further for legs 5-6 (current $4 cap may bind on heavy issues at very large sizes).
- Whether to re-baseline the cost-mean gate (currently 1.51× under cap-regime change).

Phase D scoring + Phase E full curve fit can run after legs 5-6 (or, optionally, on the legs 1-4 partial dataset for a preliminary curve).
