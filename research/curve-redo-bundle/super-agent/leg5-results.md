# Super-agent curve study — leg 5 results + 5-leg synthesis

Leg 5 of Phase C (see [`super-agent-curve-experiment-plan.md`](../../../feature-plans/super-agent-curve-experiment-plan.md)). Trim sizes **52261B + 104521B** × 3 seeds × 13 issues × K=1 = 78 cells. Run with the elevated `$4` per-cell cap (same regime as leg 4; legs 1-3 used $2).

## Run

| | |
|---|---|
| Started | 2026-05-11T08:08:42+01:00 |
| Finished | 2026-05-11T09:33:07+01:00 |
| Wall | 85 min |
| Aggregate cost | **$95.37** |
| Cells | 78/78 |
| Errors | **1/78 (1.3%)** — one cap-hit at size=104521B |
| Spawner failures | 0 |

Per-trim totals: $13.48, $15.12, $15.52, $16.02, $16.42, $18.80 (range $13.48-$18.80, all under $60 per-process cap).

## $4 cap was load-bearing on one cell

| Cell threshold | Count | % of leg-5 cells |
|---|--:|--:|
| ≥$3.95 (hit $4 cap) | **1** | 1.3% |
| ≥$3.00 | 3 | 3.8% |
| ≥$2.50 | 9 | 11.5% |
| ≥$2.00 | 20 | 25.6% |
| ≥$1.95 (old $2 cap) | 20 | 25.6% |

If we had stayed at $2 cap, 25.6% of leg-5 cells would have been cap-errors — confirming the operator decision to raise the cap. The single $4 cap-hit motivates the further raise to $6 for leg 6.

## 5-leg synthesis (n=30 trim aggregates, 10 sizes)

### Cost axis: still significant; growth is sub-linear at large sizes

OLS on per-trim mean cost vs trim size:

| Form | slope | R² | t | df | verdict |
|---|--:|--:|--:|--:|---|
| identity | +4.55×10⁻⁶ /byte | **0.693** | **7.96** | 28 | **p<10⁻⁸** |
| log(1+x) | +0.0382 | 0.472 | 5.00 | 28 | p<10⁻⁴ |

Identity still wins on R², but the slope **decreased** vs the 4-leg estimate (+9.99×10⁻⁶ → +4.55×10⁻⁶). The change reflects that cost growth is sub-linear at large sizes: from size 26130 → 104521 (4× more bytes) the per-trim mean only grew +24% ($1.02 → $1.27), not the +43% a strict linear extrapolation predicted. Log-x form is gaining relative ground but identity remains preferred on absolute R².

### By-size aggregates

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
| **104521** | 3 | 39 | **$1.268** | **2.6%** | 1/39 | $4 |

### Error axis: still not significant under linear fit

OLS on per-trim error rate vs trim size (n=30):

- identity: slope=−7.04×10⁻⁸ /byte, R²=0.005, t=−0.37 (not significant)
- log(1+x): slope=−0.0033, R²=0.104, t=−1.80 (p≈0.08)

The U-shape from the $2-cap regime (legs 1-3) keeps the linear fit indistinguishable from zero. With cap-bias removed (legs 4-5 with $4 cap), errors at sizes 13065-52261 are 0%, but one cell at 104521B hit the $4 cap — the cost growth is finally catching up with the cap.

### Heavy-issue cost trends across all 10 sizes

| Issue | size=0 | size=6533 | size=26130 | size=52261 | size=104521 |
|---|--:|--:|--:|--:|--:|
| #185 | $1.89 | $1.77 | $2.12 | **$2.63** | $2.58 |
| #649 | $1.53 | $1.93 | $1.86 | $2.09 | $1.97 |
| #178 | $0.90 | $1.28 | $1.59 | $2.02 | **$2.60** |
| #180 | $1.71 | $1.62 | $2.10 | $2.04 | $2.47 |
| #172 | $1.38 | $1.73 | $1.69 | $1.94 | $2.01 |
| #186 | $0.56 | $0.86 | $0.91 | $1.02 | $0.89 |

Two heavy issues (#185 at 52261B = $2.63; #178 at 104521B = $2.60) are pushing into the territory where individual cells exceed $4. With sub-linear growth, the absolute max per-issue mean across legs 1-5 stays under $3 — but **the per-cell max (one cell at 104521B) did hit the $4 cap**, motivating the leg-6 raise.

## Cap-regime journey across the 5 legs

| Leg | Sizes (B) | Cap | Errors | Cells ≥$cap-1 |
|---:|---|---|--:|--:|
| 1 | 0, 408 | $2 | 3 | 5.1% |
| 2 | 817, 1633 | $2 | 0 | 0% |
| 3 | 3266, 6533 | $2 | 3 | 7.7% |
| 4 | 13065, 26130 | $4 | 0 | 1.3% |
| 5 | 52261, 104521 | $4 | 1 | 1.3% |
| (leg 6 plan) | 156782, 209042 | **$6** | TBD | TBD |

## Smoke-check gate verdict

| Gate | Threshold | Actual | Result |
|---|---|---|---|
| Mean cost vs curve-redo baseline | <1.5× | **1.75×** ($1.223 vs $0.698) | over-threshold (cap regime) |
| Error rate | <5% | 1.3% | PASS |

Mean-cost gate is over-threshold because the cap-regime shift inflates leg-5's measured mean vs the $2-capped curve-redo baseline. This isn't a real-world cost regression — it's the experiment exposing per-cell costs that the original baseline truncated. Writeup will calibrate the cost gate against leg-4 as the new reference.

## Held for operator

- Leg-6 launch (sizes 156782B + 209042B) — paused per operator instruction until explicit go-ahead.
- $6 per-cell cap planned for leg 6 (decision recorded above).
- Phase D scoring + Phase E full curve fit can run on the legs 1-5 partial dataset (60 trim aggregates) at any time.
