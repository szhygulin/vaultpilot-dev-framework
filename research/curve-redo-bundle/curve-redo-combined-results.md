# Curve-redo combined fit — legs 1 + 2

Run date: 2026-05-08. Coding cells: Sonnet 4.6. Reasoning judge: Opus 4.7 (K=3 medians).
Combined dataset: 232 cells (107 leg-1 vp-mcp + 125 leg-2 vp-dev-agents); 2 envelope-parse-fail cells dropped from the 234 dispatched. Per-leg detail in [`leg1-results.md`](leg1-results.md) / [`leg2-results.md`](leg2-results.md).

## Headline

| Curve | Form | n | R² | R²adj | F | p | Quadratic-coef p |
|---|---|---:|---:|---:|---:|---:|---:|
| Accuracy | quadratic-raw | 18 | 0.3729 | 0.2892 | F(2,15)=4.46 | **0.030** ✓ | 0.015 |
| Token cost | quadratic-raw | 18 | 0.2593 | 0.1606 | F(2,15)=2.63 | 0.105 | 0.037 |

Accuracy clears the Step-7 merge gate (p < 0.05). Token cost does not on the overall F-test, but its quadratic coefficient is individually significant — same functional form is adopted for both curves so the runtime composite shares one `(degree, xTransform)` pair.

## Why not linear-log

The bundle's original Step-7 default was linear-log (degree 1, x → log(x)). On the combined 232-cell dataset:

| Form | Accuracy p | Token-cost p | R²adj (acc / tc) |
|---|---:|---:|---:|
| linear-log (original default) | 0.737 | 0.495 | −0.05 / −0.03 |
| linear-raw | 0.352 | 0.974 | −0.005 / −0.06 |
| quadratic-log | 0.188 | 0.075 | 0.09 / 0.20 |
| **quadratic-raw** ✓ | **0.030** | 0.105 | **0.29** / 0.16 |
| cubic-log | 0.038 | 0.148 | 0.32 / 0.16 |
| cubic-raw | 0.076 | 0.122 | 0.24 / 0.19 |

Both linear forms fit a flat line through the data. The combined per-bucket means are non-monotone — quality degrades 6k → 35k, then **recovers** 35k → 50k+. Linear-log's R² ≈ 0 tells us "no linear signal," but a one-way ANOVA across the 6 size buckets gives F(5,12)=3.50, p=0.035: the buckets *do* differ, just not in a shape any monotone fit can express.

Quadratic-raw is the simplest model that captures the bend. Cubic-log scores marginally higher R²adj (0.32 vs 0.29) but adds a parameter for an upturn at the 5k end driven by a single point — fragile at n=18. AIC ties the two within 0.07 (well below the 2-unit "indistinguishable" threshold), so parsimony wins.

## Per-bucket data + fitted curve

Each bucket is 3 trim seeds × (6 leg-1 + 7 leg-2) = ~39 cells, aggregated to one per-agent factor point. n=3 per bucket below is the per-agent count (3 seeds at each size).

### Accuracy (factor = qmax / quality; lower factor = better quality)

| Trim (k) | n | observed mean ± sd | quad-raw fitted |
|---:|---:|---:|---:|
| 6  | 3 | 1.0674 ± 0.0109 | 1.0539 |
| 14 | 3 | 1.0710 ± 0.0636 | 1.0910 |
| 22 | 3 | 1.0996 ± 0.0371 | 1.1129 |
| 35 | 3 | **1.1541** ± 0.0624 | **1.1151** ← worst |
| 50 | 3 | **1.0323** ± 0.0046 | 1.0670 ← best obs |
| 58 | 3 | 1.0413 ± 0.0265 | **1.0257** ← best fit |

Coefficients (standardized x; xMean=30376, xStd=18271):

```
factor(x) = 1.118679 − 0.006425·z − 0.041071·z²    where z = (x − 30376) / 18271
            (p=2e-19)  (p=0.57)      (p=0.015)
```

```
ACCURACY:  fitted curve (*) vs observed bucket means (#)        y range [1.000, 1.154]
  |                                #                                       worst quality
  |
  |                  *****************
  |           *******#                ******
  |      *****                              *****
  | # ***    #                                   ****
  |***                                               ***
  |                                                #    **#
  |                                                        **
  |                                                          **          best quality
  +------------------------------------------------------------
   5k          15k          30k          45k          60k       →  CLAUDE.md size
```

### Token cost (factor = costmax / cost ... lower = cheaper)

| Trim (k) | n | observed mean ± sd | quad-raw fitted |
|---:|---:|---:|---:|
| 6  | 3 | 1.0909 ± 0.1173 | 1.1063 |
| 14 | 3 | 1.1695 ± 0.0683 | 1.1643 |
| 22 | 3 | 1.2336 ± 0.0686 | 1.2016 |
| 35 | 3 | 1.2014 ± 0.0957 | **1.2166** ← peak |
| 50 | 3 | 1.1323 ± 0.0565 | 1.1654 |
| 58 | 3 | 1.1421 ± 0.0405 | 1.1158 |

Coefficients:

```
factor(x) = 1.217505 + 0.008619·z − 0.055865·z²    where z = (x − 30376) / 18271
            (p=1e-16)  (p=0.64)      (p=0.037)
```

```
TOKEN COST:  fitted curve (*) vs observed bucket means (#)      y range [1.085, 1.234]
  |                  #                                                   most expensive
  |                     ****************
  |                *****           #    ******
  |            ****                           ***
  |         *#*                                  ***
  |      ***                                        ***
  |    **                                          #   ** #
  |  **                                                  ***
  |**                                                       **
  | #                                                         *          cheapest
  +------------------------------------------------------------
   5k          15k          30k          45k          60k       →  CLAUDE.md size
```

## Merge

`src/util/contextCostCurve.ts` updated:
- `ACCURACY_DEGRADATION_SAMPLES` ← 18 points from `curve-redo-combined.json` (replaces 2026-05-06 K=13 samples).
- `TOKEN_COST_SAMPLES` ← 18 points (same).
- `CONTEXT_COST_REGRESSION_DEGREE`: 1 → 2.
- `CONTEXT_COST_REGRESSION_X_TRANSFORM`: `"log"` → `"identity"`.
- Provenance comment names the run date, model tier, quality formula, and the curve-form rationale.

CLI default for `vp-dev research curve-study --curve-form` updated from `linear-log` to `poly2-raw` so future calibration runs default to the same form as runtime.

## Open question

The 58k bucket sits at the upper edge of the calibration range, and the recovery from 35k → 50k+ implies the curve might keep improving past 58k — or plateau, or bend back down. The runtime hard cap is 64 KiB (SOFT_CAP_BYTES), so the practically-reachable extrapolation is small, but the shape past the calibration edge is unknown. Filed as the first **Future** bullet in `ROADMAP.md`: a leg-3 at sizes {65k, 75k, 90k, 110k} × 3 seeds × the same 13 issues would close the right tail.
