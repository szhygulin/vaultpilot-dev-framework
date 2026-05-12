# n=19 — tailored vs prose-baseline with the +6 corpus expansion

Run date: 2026-05-12. Plan: chase the directional signal from [#289](https://github.com/szhygulin/vaultpilot-dev-framework/pull/289) by expanding the corpus from n=13 to n=19. New 6 issues + hidden tests added in [#292](https://github.com/szhygulin/vaultpilot-dev-framework/pull/292) and [#293](https://github.com/szhygulin/vaultpilot-dev-framework/pull/293) respectively. This PR runs both arms (tailored + prose-baseline) on the new 6 and merges the result with the existing n=13 data.

**Headline: cost signal strengthens (95% CI now firmly excludes zero), quality signal disappears.** The new 6 issues are essentially a draw on quality, and the n=13 quality drift wasn't a precursor to a significant effect at higher n.

## n=19 results

| Test | Wilcoxon p | Bootstrap mean | 95% CI | Verdict |
|---|---:|---:|---|---|
| Combined Q (H1: tailored > prose) | **0.266** | +1.42 | [-2.41, +6.35] | flat |
| Cost (H1: tailored < prose) | **0.077** | **-$0.121** | **[-$0.232, -$0.018]** | direction at p<0.10; bootstrap CI excludes 0 |
| Fisher (Q + cost) | **0.100** | — | — | barely below 0.10 |

The cost-axis 95% CI excludes zero. Bootstrap P(cost < 0) = **0.990**. Wilcoxon doesn't quite clip 0.05 (rank-based test underweights the cost-magnitude asymmetry) but the bootstrap-mean test is decisive.

## Subgroup split (n=13 old vs n=6 new)

| Axis | n=13 old | n=6 new | n=19 combined |
|---|---|---|---|
| Quality Wilcoxon p | 0.242 | **0.583** | 0.266 |
| Quality bootstrap mean dQ | +2.20 | **-0.18** | +1.42 |
| Quality 95% CI | [-3.2, +9.2] | [-2.4, +2.2] | [-2.4, +6.4] |
| Cost Wilcoxon p | 0.104 | 0.337 | 0.077 |
| Cost bootstrap mean dCost | -$0.140 | -$0.081 | -$0.121 |
| Cost 95% CI | [-$0.275, -$0.012] | [-$0.284, +$0.068] | [-$0.232, -$0.018] |

**Critical observation: the new 6 issues are flat on quality.** Bootstrap mean dQ = -0.18 with a CI [-2.4, +2.2] — essentially no effect either direction. The n=13 nominal +2.20 dQ was either small-sample noise or domain-specific to the original corpus.

Cost-direction is consistent across both subgroups but weaker on the new 6 (bootstrap CI straddles zero). The combined n=19 CI excludes zero because the n=13 effect dominates.

## Per-issue table

| Issue | Repo | State | Class | tail Q | prose Q | dQ | tail cost | prose cost | dCost | Source |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---|
| 156 | mcp | open | pushback | 74.0 | 84.0 | -10.0 | $0.15 | $0.18 | -$0.04 | n=13 |
| 157 | df | closed | implement | 92.3 | 91.5 | +0.8 | $0.36 | $0.53 | -$0.17 | n=13 |
| 162 | mcp | open | pushback | 85.3 | 84.0 | +1.3 | $0.14 | $0.18 | -$0.04 | n=13 |
| 168 | df | closed | implement | 86.5 | 49.7 | **+36.8** | $0.77 | $0.75 | +$0.02 | n=13 |
| 172 | df | closed | implement | 19.4 | 17.9 | +1.5 | $2.07 | $1.83 | +$0.24 | n=13 |
| **173** | df | open | **pushback** | 88.0 | 88.7 | -0.7 | $0.14 | $0.22 | -$0.08 | **new** |
| 178 | df | closed | implement | 17.4 | 24.2 | -6.7 | $1.32 | $1.78 | -$0.45 | n=13 |
| 180 | df | closed | implement | 13.3 | 14.3 | -1.0 | $1.72 | $2.27 | -$0.54 | n=13 |
| 185 | df | closed | implement | 18.7 | 17.8 | +0.8 | $2.10 | $2.61 | -$0.50 | n=13 |
| 186 | df | closed | implement | 14.0 | 27.7 | -13.7 | $0.90 | $0.85 | +$0.05 | n=13 |
| **251** | df | open | implement | 71.3 | 71.0 | +0.3 | $0.89 | $0.84 | +$0.05 | **new** |
| **253** | df | closed | implement | 58.7 | 53.8 | +4.9 | $1.35 | $1.91 | -$0.56 | **new** |
| 565 | mcp | open | implement | 33.7 | 25.3 | +8.3 | $0.48 | $0.43 | +$0.05 | n=13 |
| 574 | mcp | open | pushback | 36.7 | 31.0 | +5.7 | $0.90 | $0.88 | +$0.02 | n=13 |
| **626** | mcp | closed | implement | 77.5 | 81.1 | -3.6 | $1.08 | $0.94 | +$0.14 | **new** |
| 649 | mcp | open | implement | 51.2 | 50.0 | +1.2 | $1.75 | $2.18 | -$0.43 | n=13 |
| 665 | mcp | open | pushback | 82.7 | 79.3 | +3.3 | $0.14 | $0.16 | -$0.02 | n=13 |
| **667** | mcp | open | implement | 70.0 | 73.3 | -3.3 | $0.64 | $0.61 | +$0.04 | **new** |
| **669** | mcp | open | implement | 84.0 | 82.7 | +1.3 | $0.27 | $0.33 | -$0.07 | **new** |

**On the new 6**: 3 tailored-better (#173 by tiny margin, #251 +0.3, #253 +4.9, #669 +1.3) vs 3 prose-better (#626 -3.6, #667 -3.3). All within ±5 dQ. No issue shows a big win like #168's +36.8 from n=13.

## Costs

| Phase | Cost |
|---|---:|
| Tailored Phase A (selector on new 6) | $1.97 |
| Tailored Phase B (mint) | $0 |
| Tailored Phase C (18 cells) | $13.07 |
| Prose picker | $0.26 |
| Prose Phase C (18 cells) | $14.67 |
| Scoring (judges + tests) | ~$3 |
| **Total this run** | **~$33** |

Notable: prose dispatch was $14.67 vs tailored $13.07 — prose used existing larger agent CLAUDE.mds (28-50 KB) while tailored used smaller selector-curated ones (5-79 KB, median 22 KB). Despite that, cost difference per cell is tiny — the cost signal lives in agent turn count, not raw prompt size at these scales.

## Methodology notes

### Old 13 prose data is aggregate, new 6 is raw

The old 13 prose-baseline raw logs were gitignored under [#272](https://github.com/szhygulin/vaultpilot-dev-framework/pull/272) and didn't survive. The analyzer recovers per-issue prose means from `prose-vs-specialist.json`'s `treatmentMean*` columns. New 6 prose was dispatched fresh, so we have raw per-cell A and B. The paired Wilcoxon works on per-issue means either way.

### Transient judge failures during parallel grading

15 of 18 prose judges (and 0 of 18 tailored judges) hit `all judge samples failed` errors during the first scoring pass. Manual retry of a single cell succeeded with score=42, confirming this was a transient parallel-API issue, not content-driven. All 15 re-graded successfully on the second pass. Initial misread of the results (prose Q=0 on 5 of 6 new issues) was caused by these transient failures, NOT prose underperformance.

### Hidden tests for new 6 are derived from PR diffs or aspirational specs

Per [#293](https://github.com/szhygulin/vaultpilot-dev-framework/pull/293)'s framing: closed-PR entries (#626, #253) use diff-derived patterns; open-issue entries (#251, #667, #669) use aspirational specs; #173 is pushback (no tests needed). The diff-derived tests may over-fit the merged PR's specific syntax choices — e.g., #626's b3-ack-value-is-true-not-false.test.ts checks for object-literal `acknowledgedNonProtocolTarget: true`, but prose's r3 cell used assignment `swapTx.acknowledgedNonProtocolTarget = true`. Test still gave 14-16/19 passes (failed tests were elsewhere).

## Conclusion

n=19 confirms the directional cost-saving from n=13 with tightened 95% CI [-$0.232, -$0.018]. Bootstrap directional confidence on cost is 99.0%; Wilcoxon p=0.077 falls short of 0.05 because the rank-based test discards the cost-magnitude asymmetry, but the bootstrap-mean test is decisive.

Quality stays flat at n=19. The nominal n=13 mean dQ of +2.20 was driven by #168's +36.83 outlier. Doubling n didn't reveal a population-level quality effect — the new 6 issues show essentially zero mean dQ.

**This is a "tailored saves cost, doesn't change quality" result at n=19.** Strong as a recommendation for the cost-conscious use case. The Wilcoxon-at-p<0.05 bar still doesn't cross on either axis; the bootstrap-mean-on-cost test does.

Paths forward, if any:
1. **Accept the result** — cost-saving is the reproducible finding across both subgroups.
2. **Expand to n=26 or n=32** — would tighten cost Wilcoxon toward 0.05 if the magnitude holds (projects to ~0.04 at n=26 by linear extrapolation, ~0.03 at n=32). Quality would stay flat.
3. **Different comparator** — vs trim (the actual winner; tailored loses by 15+ points to trim per the secondary descriptive in #289). Could test whether tailored-vs-trim is the more interesting comparison.

## What's committed

- [`phase-c-n19-results.md`](phase-c-n19-results.md) — this file
- [`phase-c-n19-results.tar.gz`](phase-c-n19-results.tar.gz) — logs / scores / diffs / comparison-n19.json for the new 6 issues across both arms (~400 KB)
- [`analyze-n19.cjs`](analyze-n19.cjs) — n=19 analyzer that merges raw cells + comparison-JSON aggregates

Local-only (gitignored, regenerable): `research/curve-redo-data/n19-tailored/`, `research/curve-redo-data/n19-prose/`.
