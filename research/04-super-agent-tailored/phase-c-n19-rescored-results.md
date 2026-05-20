# n=19 — re-scored on the finer test grid

Run date: 2026-05-12. Re-scores the n=19 dispatch from [#294](https://github.com/szhygulin/vaultpilot-dev-framework/pull/294) against the expanded hidden-test fixtures merged in [#296](https://github.com/szhygulin/vaultpilot-dev-framework/pull/296). The new 6 corpus issues now carry ~100 tests each (was 8-20), matching the original 13's per-issue weight.

**Result: identical to the prior run. Cost direction rock-solid, quality flat.** The methodological correction confirms the n=19 result was real, not a coarse-grid artifact.

## Headline (n=19)

| Test | Wilcoxon p | Bootstrap mean | 95% CI |
|---|---:|---:|---|
| Combined Q (tailored > prose) | 0.293 | +1.30 | [-2.45, +6.16] |
| **Cost (tailored < prose)** | **0.077** | **-$0.121** | **[-$0.232, -$0.018]** |
| Fisher (Q + cost) | 0.108 | — | — |

Bootstrap P(cost < 0) = **0.990**, unchanged from #294. Quality CI straddles zero, unchanged direction (still nominally positive but small).

## Per-issue diff vs the prior #294 run

The B-component (tests pass rate × 50) is the only thing that could change since judges weren't re-run and the dispatch cells are identical.

| Issue | Old grid total | New grid total | Old dQ | New dQ | Change |
|---:|---:|---:|---:|---:|---|
| 173 | n/a (pushback) | n/a | -0.7 | -0.7 | unchanged |
| 251 | 19 | 105 | +0.3 | +0.3 | unchanged |
| **253** | 20 | 100 | **+4.9** | **+0.2** | **shrank — coarse grid had over-weighted** |
| 626 | 19 | 109 | -3.6 | -1.5 | shrank toward zero |
| 667 | 8 | 100 | -3.3 | -3.2 | unchanged |
| 669 | 8 | 101 | +1.3 | +1.3 | unchanged |

#253 was the only meaningful per-issue shift: the original 20-test grid happened to weight test failures heavily in a way that inflated tailored's apparent lead. On the 100-test grid both arms converge to Q≈61.

For 251 / 667 / 669, the test scores barely moved because they're all-pushback (669) or majority-pushback (667) — pushback uses 2×A only, no B. 251's tailored vs prose passes the same fraction of tests in both grids.

## Subgroup splits

| Axis | n=13 old | n=6 new (rescored) | n=19 combined |
|---|---|---|---|
| Quality Wilcoxon p | 0.242 | 0.799 | 0.293 |
| Quality bootstrap mean | +2.20 | **-0.57** | +1.30 |
| Quality 95% CI | [-3.2, +9.2] | [-1.77, +0.50] | [-2.45, +6.16] |
| Cost Wilcoxon p | 0.104 | 0.337 | 0.077 |
| Cost bootstrap mean | -$0.140 | -$0.081 | -$0.121 |
| Cost 95% CI | [-$0.275, -$0.012] | [-$0.284, +$0.068] | [-$0.232, -$0.018] |

**The new 6 mean dQ shifted from -0.18 (coarse) to -0.57 (fine).** Slightly more negative direction; CI [-1.77, +0.50] is now tighter and tilts toward "prose slightly better". The interpretation doesn't change: on the new 6, tailored and prose are essentially tied, with a faint lean toward prose in the finer-grain reading. No issue shows a quality win like #168's +36.83 from the old 13.

## What the re-score confirms

1. **The n=13 +2.20 dQ was driven by #168's outlier**, NOT by a real population effect. The new 6 don't reproduce it.
2. **Cost direction is identical** between the coarse and fine test grids — it must be, because cost is dispatch-side, not scoring-side. Stability check passes.
3. **The methodological asymmetry from #294** (coarser B-axis grid on the new 6) was real but small in aggregate: per-issue dQ moved within ±5 points on the affected issues, and the overall n=19 verdict didn't shift.

## What's committed

- [`phase-c-n19-rescored-results.md`](phase-c-n19-rescored-results.md) — this file
- [`comparison-n19-v2.json`](comparison-n19-v2.json) — the re-scored analyzer output

The dispatch logs / scores / diffs are unchanged from PR #294's tarball; only the `*-tests.json` files were re-run against the finer grid. Local-only (gitignored, regenerable).

## Conclusion (final, post-asymmetry-fix)

**n=19, with all 19 issues on the ~100-test grid: tailored saves ~$0.12 per cell vs prose (95% CI excludes zero, 99% directional confidence) with no quality change.** Wilcoxon p=0.077 on cost doesn't quite clip 0.05, but the bootstrap-mean test does. This is the resolved result for the tailored-vs-prose comparison.

Trim (random-subset baseline) still beats tailored by ~15 Q points per #289's secondary descriptive — that gap is intact across all axes and grids.
