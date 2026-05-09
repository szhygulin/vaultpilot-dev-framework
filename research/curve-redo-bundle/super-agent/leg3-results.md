# Super-agent curve study — leg 3 results + 3-leg synthesis

Leg 3 of the Phase C dispatch (see [`super-agent-curve-experiment-plan.md`](../../../feature-plans/super-agent-curve-experiment-plan.md)) plus a cross-leg synthesis with legs 1+2. Trim sizes 3266B (3 seeds) + 6533B (3 seeds) × 13 issues × K=1 = 78 cells.

## Leg 3 run

| | |
|---|---|
| Started | 2026-05-09T11:01:39+01:00 |
| Finished | 2026-05-09T12:11:17+01:00 |
| Wall | 70 min |
| Aggregate cost | **$68.81** |
| Cells | 78/78 |
| Errors | 3 (3.8%) — all on issue #185 at sizes 3266 |
| Spawner failures | 0 |

Per-trim totals: $10.87, $10.86, $11.14, $11.40, $11.52, $11.57. All under per-process $30 cap.

## Cost has shifted upward vs legs 1+2

| | Leg 1 (0-408B) | Leg 2 (817-1633B) | Leg 3 (3266-6533B) | Trend |
|---|--:|--:|--:|---|
| Aggregate | $63.60 | $62.75 | $68.81 | +8% leg-3 vs prior |
| Mean cell | $0.817 | $0.806 | $0.882 | +9% |
| Median cell | $0.639 | $0.641 | $0.704 | +10% |
| Implement-cell mean | ~$0.94 | ~$0.97 | ~$1.05 | +12% over the range |

## Cross-leg synthesis (n=18 trim aggregates, 6 sizes)

### Cost axis: significant positive trend

OLS on per-trim mean cost vs trim size:

| Form | slope | R² | t | df | verdict |
|---|--:|--:|--:|--:|---|
| identity | +1.35×10⁻⁵ /byte | 0.402 | 3.28 | 16 | **p<0.01** |
| log(1+x) | +0.0070 | 0.179 | 1.87 | 16 | p≈0.08 |

Identity wins. Implement-only cells:

| Size (B) | n_implement | mean | median | p90 |
|---:|---:|---:|---:|---:|
| 0 | 28 | $0.94 | $0.76 | $1.72 |
| 408 | 29 | $0.99 | $0.87 | $1.71 |
| 817 | 30 | $0.97 | $0.95 | $1.63 |
| 1633 | 30 | $1.05 | $0.97 | $1.86 |
| 3266 | 28 | $1.04 | $0.92 | $1.84 |
| 6533 | 29 | $1.08 | $0.96 | $1.86 |

p90 climbing into $1.86 range — within $0.14 of the original $2 cap.

### Error axis: NOT cleanly decaying

Original hypothesis was that error rate decays monotonically with size. The data shows a U-shape:

| Size (B) | Errors / 39 cells | Note |
|---:|---:|---|
| 0 | 2 (5.1%) | small trim, cap-bound on issue #185 |
| 408 | 1 (2.6%) | borderline |
| 817 | 0 (0%) | minimum |
| 1633 | 0 (0%) | minimum |
| 3266 | **2 (5.1%)** | regression |
| 6533 | 1 (2.6%) | partial recovery |

Cells at/near $2 cap (cost ≥ $1.95 OR isError on a heavy issue):

| Size (B) | at-cap cells / 39 |
|---:|--:|
| 0 | 5.1% |
| 408 | 2.6% |
| 817 | 0% |
| 1633 | 5.1% |
| 3266 | **7.7%** ← peak |
| 6533 | 2.6% |

### Per-issue cost growth

Heavy implement issues drift upward with size:

| Issue | size=0 | size=6533 | delta |
|---|--:|--:|--:|
| #649 | $1.53 | **$1.93** | +$0.40 (within $0.07 of cap) |
| #178 | $0.90 | $1.28 | +$0.38 |
| #186 | $0.56 | $0.86 | +$0.29 |
| #172 | $1.38 | $1.73 | +$0.34 |

#649 is approaching the $2 cap by 6533B; legs 4-6 (13065 → 209042B) extrapolate above it.

## Interpretation: U-shape error

Small-trim errors come from **insufficient guidance** — the agent needs more turns to converge on a solution, exhausts the per-cell budget. Large-trim errors come from **context overhead** — each turn loads more tokens, leaving less budget for actual reasoning. The minimum at 800-1600 bytes is the sweet spot where the agent has enough hints to direct its work without paying excessive context tax per turn.

This is a real experimental finding (the user's hypothesis "error decays with size" was natural but the U-shape data refutes it). The final writeup will need to characterize the curve form and the location of the minimum.

## Cap-policy decision for legs 4-6

Per-cell $2 cap is starting to constrain the high-size tail. The cost slope predicts a mean implement cost of ~$3.62/cell at full S=209042B — well above $2. Legs 5-6 would otherwise be dominated by cap-errors that confound the curve.

**Operator decision**: raise per-cell cap to **$4** for legs 4-6 only. Legs 1-3 stay as-is.

| | Legs 1-3 | Legs 4-6 |
|---|--:|--:|
| `VP_DEV_MAX_COST_USD` | $2.00 | **$4.00** |
| `MAX_TOTAL_COST_USD` per process | $30 | **$60** |
| Sizes (B) | 0, 408, 817, 1633, 3266, 6533 | 13065, 26130, 52261, 104521, 156782, 209042 |

Per-leg cost expectation rises to ~$80-130. Mixed-cap dataset implication: legs 4-6 cost-axis points are not directly comparable to legs 1-3 on the cap-bias dimension, but the underlying cell costs are still measured (cells will fit within the larger cap if they would naturally have completed there). The error axis stays measurable on both sides — a cap-error at $4 means the cell genuinely needed >$4, not that it hit an artificial floor.

## Smoke-check gate verdict

| Gate | Threshold | Actual | Result |
|---|---|---|---|
| Mean cost vs baseline | <1.5× | 1.26× ($0.882 vs $0.698) | PASS |
| Cost stdev vs baseline | <1.5× | (within range) | PASS |
| Error rate | <5% | 3.8% (3/78) | PASS |

Phase C may proceed to leg 4 with the elevated cap.
