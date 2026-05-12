# n=19 split analysis — judge-A vs tests-B separately

Run date: 2026-05-12. Decomposes the combined-Q axis from [#297](https://github.com/szhygulin/vaultpilot-dev-framework/pull/297) into its two underlying components:

- **Judge-A**: Opus K=3 reasoning grade per cell, median 0-50. Valid for every cell with a non-error judge (both implement and pushback decisions).
- **Tests-B**: hidden-test pass rate × 50, range 0-50. Valid only for implement cells with a non-empty diff that applied cleanly to the test clone.

**Result: tailored and prose are statistically indistinguishable on both axes at this n, with per-issue deltas tightly clustered around zero.**

## Constraints

Old-13 prose raw cells didn't survive (gitignored under [#272](https://github.com/szhygulin/vaultpilot-dev-framework/pull/272)); only aggregate combined-Q is recoverable. Therefore paired A-axis and B-axis tests are restricted to the new 6 issues where this run's dispatch has raw cells for both arms.

| Comparison | Tailored data | Prose data | Paired n |
|---|---|---|---:|
| Combined Q | n=19 raw | n=13 aggregate + n=6 raw | 19 |
| Judge-A | n=19 raw | n=6 raw only | **6** |
| Tests-B | n=13 raw (implements only) | n=3 raw (where prose implemented too) | **3** |

## Paired tests on the new 6

| Axis | n | Wilcoxon p (H1: tailored > prose) | Bootstrap mean Δ | 95% CI | P(>0) |
|---|---:|---:|---:|---|---:|
| Judge-A | 6 | 0.458 | +0.47 | [-0.53, +1.83] | 0.736 |
| Tests-B | 3 | 0.500 | +0.07 | [-0.46, +0.67] | 0.588 |

Neither comes close to rejecting equality. n=3 on B is below the threshold for any meaningful inference.

## Per-issue paired deltas (new 6)

| Issue | tail A | prose A | dA | tail B | prose B | dB | Notes |
|---:|---:|---:|---:|---:|---:|---:|---|
| 173 | 44.00 | 44.33 | -0.33 | — | — | — | both arms pushback (no B) |
| 251 | 41.33 | 41.00 | +0.33 | 39.52 | 39.52 | 0.00 | identical B; tied A |
| 253 | 42.00 | 42.50 | -0.50 | 19.17 | 18.50 | +0.67 | nearly tied |
| 626 | 40.67 | 41.67 | -1.00 | 43.88 | 44.34 | -0.46 | nearly tied |
| 667 | 35.00 | 31.33 | +3.67 | — | 49.50 | — | tailored 3/3 pushback; prose r1 implemented (high B, lower A) |
| 669 | 42.00 | 41.33 | +0.67 | — | — | — | both arms pushback |

**All non-null dA values are within ±1 except #667.** All non-null dB values are within ±0.7.

#667 is the only meaningful divergence: tailored all-pushback, prose mixed. The decision-class mismatch dominates the per-issue Q delta on that issue but disappears when you split A and B — within decisions actually made, both arms grade similarly.

## Tailored per-issue (n=19) — full distribution

Decision class noted; pushback issues have `n/a` for B (no implement, no test data).

| Issue | Decision | A | B | Q (A+B or 2A) |
|---:|---|---:|---:|---:|
| 156 | pushback | 37.00 | n/a | 74.00 |
| 157 | implement | 43.33 | 49.00 | 92.33 |
| 162 | pushback | 42.67 | n/a | 85.33 |
| 168 | implement | 43.00 | 43.50 | 86.50 |
| 172 | implement | 42.00 | 15.20 | 19.40 |
| 173 | pushback | 44.00 | n/a | 88.00 |
| 178 | implement | 37.00 | 22.27 | 17.42 |
| 180 | implement | 41.00 | 0.00 | 13.33 |
| 185 | implement | 40.00 | 16.00 | 18.67 |
| 186 | implement | 41.67 | 0.00 | 14.00 |
| 251 | implement | 41.33 | 39.52 | 80.85 |
| 253 | implement | 42.00 | 19.17 | 61.17 |
| 565 | implement | 30.67 | 3.00 | 33.67 |
| 574 | implement | 22.67 | 14.00 | 36.67 |
| 626 | implement | 40.67 | 43.88 | 84.55 |
| 649 | implement | 27.67 | 23.56 | 51.22 |
| 665 | pushback | 41.33 | n/a | 82.67 |
| 667 | pushback | 35.00 | n/a | 70.00 |
| 669 | pushback | 42.00 | n/a | 84.00 |

**Note on implement-class Q < 2A:** when an implement cell has B=0 (test apply failed or all tests failed) AND a non-null A, qualityFromAB still returns 0 for that cell because the formula requires BOTH non-null A and non-null B for implements. The per-issue Q values for #172, #178, #180, #185, #186, #565, #574 reflect averages where only some replicates contributed non-zero Q (typically 1 of 3 had clean apply + tests).

### Summary statistics

| Stat | Judge-A (n=19) | Tests-B (n=13 implements) |
|---|---:|---:|
| Mean | **38.68 / 50** (77.4%) | **22.24 / 50** (44.5%) |
| Median | 41.33 | 19.17 |
| Range | [22.67, 44.00] | [0.00, 49.00] |
| Top 3 | #173 (44.0), #157 (43.3), #168 (43.0) | #157 (49.0), #626 (43.9), #168 (43.5) |
| Bottom 3 | #574 (22.7), #649 (27.7), #565 (30.7) | #180 (0.0), #186 (0.0), #565 (3.0) |

**Pattern**: A is tight (22-44 range, σ small), B is wide (0-49 range). Judge scores cluster — even the worst-scoring tailored cells get ≥22 on reasoning. Test scores have the full range because implementation correctness is bimodal: either the diff works (40+) or it doesn't (0-15).

Pushback issues (#156, #162, #173, #665, #667, #669) all scored A ≥ 35; the agent's reasoning when pushing back is grade-able and consistent. The implement-class issues span the full A range; #574 and #649 are where the tailored implementation reasoning was weakest.

## Interpretation

**The combined-Q signal in [#297](https://github.com/szhygulin/vaultpilot-dev-framework/pull/297) was driven by decision-class composition, not by quality differences within a decision class.** When you align by issue and split A from B, both arms produce judge scores within ±1 point and test scores within ±0.7 points. The cost-axis advantage (-$0.121/cell, 95% CI excludes zero) stands as the only reproducible effect.

**Caveat on power:** n=6 on A and n=3 on B are far below the threshold for any directional claim. The tests aren't rejecting equality, but they also can't detect a small real effect. The conclusion is "no meaningful difference visible at this n on either decomposed axis" — which is consistent with the n=19 combined-Q flat verdict but doesn't strengthen it.

## What's committed

- [`phase-c-n19-split-results.md`](phase-c-n19-split-results.md) — this file
- [`analyze-n19-split.cjs`](analyze-n19-split.cjs) — split analyzer (judge-A and tests-B separately)
- [`split-n19.json`](research/curve-redo-data/n19/split-n19.json) — analyzer output (gitignored runtime path; included in tarball)

The dispatch + scoring data is unchanged from PR #297; this PR is reanalysis-only, $0 API cost.
