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

## Tailored absolute distributions (n=19)

| Statistic | Value |
|---|---:|
| Mean Judge-A across 19 issues | **38.68 / 50** (77.4%) |
| Mean Tests-B across 13 implement issues | **22.24 / 50** (44.5%) |

Wide spread on B: from 0 (#180, #186 — diffs apply but most tests fail) to 49 (#157 — near-perfect). On A: 22-44 range, tighter — judge scores are systematically less variable than test scores.

## Interpretation

**The combined-Q signal in [#297](https://github.com/szhygulin/vaultpilot-dev-framework/pull/297) was driven by decision-class composition, not by quality differences within a decision class.** When you align by issue and split A from B, both arms produce judge scores within ±1 point and test scores within ±0.7 points. The cost-axis advantage (-$0.121/cell, 95% CI excludes zero) stands as the only reproducible effect.

**Caveat on power:** n=6 on A and n=3 on B are far below the threshold for any directional claim. The tests aren't rejecting equality, but they also can't detect a small real effect. The conclusion is "no meaningful difference visible at this n on either decomposed axis" — which is consistent with the n=19 combined-Q flat verdict but doesn't strengthen it.

## What's committed

- [`phase-c-n19-split-results.md`](phase-c-n19-split-results.md) — this file
- [`analyze-n19-split.cjs`](analyze-n19-split.cjs) — split analyzer (judge-A and tests-B separately)
- [`split-n19.json`](research/curve-redo-data/n19/split-n19.json) — analyzer output (gitignored runtime path; included in tarball)

The dispatch + scoring data is unchanged from PR #297; this PR is reanalysis-only, $0 API cost.
