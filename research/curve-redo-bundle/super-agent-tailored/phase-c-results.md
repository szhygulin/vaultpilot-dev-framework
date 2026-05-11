# Phase C/D/E — Super-agent-tailored vs prose-baseline

Run date: 2026-05-11. Plan: [`feature-plans/super-agent-tailored-experiment-plan.md`](../../../feature-plans/super-agent-tailored-experiment-plan.md). Phase A: [PR #282](https://github.com/szhygulin/vaultpilot-dev-framework/pull/282). Phase B: [PR #287](https://github.com/szhygulin/vaultpilot-dev-framework/pull/287). Tailored agents minted from Opus 4.7's per-issue selections against the 122-section super-agent file ([PR #276](https://github.com/szhygulin/vaultpilot-dev-framework/pull/276)).

Audit data: [`phase-c-results.tar.gz`](phase-c-results.tar.gz) — logs-leg{1,2}, scores-leg{1,2}, diffs-leg{1,2}, comparison.json.

## Headline

| | Tailored | Prose |
|---|---:|---:|
| Mean quality per issue | varies; **+1.94 mean dQ** vs prose | — |
| Mean cost per issue | varies; **-$0.17 mean dCost** vs prose | — |
| Wilcoxon p (quality, H1: dQ > 0) | **0.242** | — |
| Wilcoxon p (cost, H1: dCost < 0) | **0.104** | — |
| Hedges' g (quality) | 0.170 (small) | — |
| **Verdict (soft-bar p<0.05 on either)** | **no-significant-difference** | — |

**Tailored does not significantly beat prose on either axis at the experiment's pre-registered soft bar.** Quality direction is nominally favorable (+1.94 dQ, p=0.24); cost direction is also nominally favorable (-$0.17 dCost, p=0.10) but neither crosses 0.05.

## Phase C — dispatch ($38.43 / 39 cells / 0 errors)

Dispatcher: [`dispatch-tailored-parallel.sh`](dispatch-tailored-parallel.sh) → [`dispatch-specialist-redo-parallel.sh`](../specialist-redo/dispatch-specialist-redo-parallel.sh). K=3 cells per issue, Sonnet 4.6, `--dry-run --no-target-claude-md --skip-summary --no-registry-mutation`, per-cell $10 cap, parallel=4.

| Leg | Issues | Cells | Cost | Errors | Wall |
|---:|---:|---:|---:|---:|---:|
| 1 (vaultpilot-mcp, open) | 6 | 18 | $10.67 | 0 | ~18 min |
| 2 (vaultpilot-dev-framework, closed) | 7 | 21 | $27.76 | 0 | ~25 min |
| **Total** | **13** | **39** | **$38.43** | **0** | **~43 min** |

First leg-1 launch failed instantly ($0 spent, glibc/musl SDK binary issue from [#251](https://github.com/szhygulin/vaultpilot-dev-framework/issues/251)) — re-launched with `VP_DEV_CLAUDE_BIN=$PWD/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude` per CLAUDE.md's pre-dispatch SDK binary preflight rule. All subsequent cells dispatched cleanly.

Cost distribution heavily skewed by a few cross-cutting issues:
- #649 (cost-preview, 21 kept sections): $5.24 sum across K=3, one cell hit $2.42
- #185 ($6.31), #172 ($6.20), #180 ($5.17): all > $5/K=3, all in leg 2 (dev-framework dispatcher/orchestrator issues with high read-edit-reread overhead)
- Cheapest: #156, #162, #665 — all ≤ $0.45/K=3

## Phase D — scoring (~$3 sequential Opus K=3 grading + 18 hidden-test runs)

Scorer: [`score-tailored.sh`](score-tailored.sh) → `vp-dev research grade-reasoning` + `vp-dev research run-tests`. K=3 Opus blind grading per cell + hidden tests for `implement` decisions only.

- Leg 1: 18 cells → 18 judge files + 9 tests files (9 implements / 9 pushbacks). Wall ~11 min.
- Leg 2: 21 cells → 21 judge files + 21 tests files (all 21 are implements). Wall ~16 min.

One tests-non-zero: `bench-r3-agent-super-tailored-186-186-tests.json` — apply error `src/agent/prompt.test.ts: already exists in working directory` (score-clone reuse race). Combined-quality scoring treats failed-apply as 0 for the implement A+B component, so this cell scores on its judge-A side only.

## Phase E — paired Wilcoxon vs prose-baseline

Adapter: [`analyze-tailored-vs-prose.cjs`](analyze-tailored-vs-prose.cjs). Prose-baseline raw logs were gitignored and didn't survive ([PR #272](https://github.com/szhygulin/vaultpilot-dev-framework/pull/272) only committed comparison JSONs). The adapter recovers per-issue prose mean Q + mean cost from `prose-vs-specialist.json`'s `treatmentMean*` columns (treatment = prose; baseline = the comparison arm). Cross-checked against `prose-vs-naive.json`'s prose-side columns — consistent to ≤ 0.01 Q across all 13 issues.

### Per-issue results (13 paired)

| Issue | Repo | Class | tailQ | proseQ | dQ | tailCost | proseCost | dCost | Kept |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| 156 | vaultpilot-mcp | pushback | 74.00 | 84.00 | **-10.00** | $0.15 | $0.18 | -$0.04 | 10 |
| 157 | vp-dev-framework | implement | 92.33 | 91.50 | +0.83 | $0.36 | $0.53 | -$0.17 | 7 |
| 162 | vaultpilot-mcp | pushback | 85.33 | 84.00 | +1.33 | $0.14 | $0.18 | -$0.04 | 6 |
| 168 | vp-dev-framework | implement | 86.50 | 49.67 | **+36.83** | $0.77 | $0.75 | +$0.02 | 10 |
| 172 | vp-dev-framework | implement | 19.40 | 17.90 | +1.50 | $2.07 | $1.83 | +$0.24 | 17 |
| 178 | vp-dev-framework | implement | 17.42 | 24.15 | **-6.73** | $1.32 | $1.78 | **-$0.45** | 16 |
| 180 | vp-dev-framework | implement | 13.33 | 14.33 | -1.00 | $1.72 | $2.27 | **-$0.54** | 13 |
| 185 | vp-dev-framework | implement | 18.67 | 17.83 | +0.83 | $2.10 | $2.61 | **-$0.50** | 17 |
| 186 | vp-dev-framework | implement | 14.00 | 27.67 | **-13.67** | $0.90 | $0.85 | +$0.05 | 10 |
| 565 | vaultpilot-mcp | implement | 33.67 | 25.33 | +8.33 | $0.48 | $0.43 | +$0.05 | 37 |
| 574 | vaultpilot-mcp | pushback | 36.67 | 31.00 | +5.67 | $0.90 | $0.88 | +$0.02 | 28 |
| 649 | vaultpilot-mcp | implement | 51.22 | 49.99 | +1.24 | $1.75 | $2.18 | **-$0.43** | 21 |
| 665 | vaultpilot-mcp | pushback | 82.67 | 79.33 | +3.33 | $0.14 | $0.16 | -$0.02 | 15 |

### Statistical tests

| Test | Statistic | p-value | Pass at p<0.05? |
|---|---:|---:|:---:|
| Wilcoxon (quality, H1: dQ > 0) | n=13, w+=56.0, z=0.699 | **0.242** | no |
| Wilcoxon (cost, H1: dCost < 0) | n=13, w+=27.0, z=-1.258 | **0.104** | no |

Hedges' g for dQ: **0.170** (small effect).

### Verdict

**No significant difference** at p<0.05 on either dimension. The directional signal is favorable to tailored (positive median dQ, negative median dCost) but neither test crosses 0.05.

## Reanalysis — single-axis + Fisher + stratification

Operator chose to drop the multiplicity penalty (each axis tested independently at p<0.05, no Holm-Bonferroni correction) since the primary interest is quality with cost as secondary. Also reported Fisher combination of the two p-values, and stratification by `decisionClass`.

| Test | n | Statistic | p | Decision (α=0.05) |
|---|---:|---|---:|:---:|
| Quality (H1: dQ > 0), pooled | 13 | w+=56, z=0.699 | 0.242 | no |
| Cost (H1: dCost < 0), pooled | 13 | w+=27, z=-1.258 | 0.104 | no |
| Fisher combination of the two | — | χ²(4)=7.36 | **0.118** | no |
| Quality, implement only | 9 | — | 0.277 | no |
| **Cost, implement only** | 9 | — | **0.096** | no (barely) |
| Quality, pushback only | 4 | — | 0.428 | no |
| Cost, pushback only | 4 | — | 0.181 | no |

### Where the signal lives

| Subset | n | mean dQ | mean dCost |
|---|---:|---:|---:|
| All | 13 | +1.94 | -$0.17 |
| **Implement** | **9** | **+3.13** | **-$0.19** |
| Pushback | 4 | +0.08 | -$0.02 |

**Both the quality and cost signals are concentrated in the implement subset.** Pushbacks (#156, #162, #574, #665) show essentially no effect on either axis — mean dQ +0.08, mean dCost -$0.02 — meaning tailored and prose are indistinguishable when the agent's job is "push back, don't act". The hypothesis that tailored prose helps acts most plausibly on implements (where the agent's prompt context shapes the actual code-writing path); pushbacks are decision-class judgments that depend on issue-body parsing more than prompt richness.

The cost-axis on implements alone reaches p=0.096 — close to crossing at n=9. Doubling the implement subset (n=18) under the same magnitude would project to p ≈ 0.03 if the directional signal is real.

### Implication

If you weight quality as the primary axis: **no decision at this n**. Cost is closer but still doesn't cross 0.05 on the pooled test. The implement-only cost test is the closest single result to significance (p=0.096) and is mechanistically defensible — it's where the experimental theory predicts the effect should live.

### Pattern reading

- **Cross-cutting wins**: #168 (+36.83 Q, 10 sections kept) is the single largest dQ — tailored handled it dramatically better than prose. Looking at the kept-section list, it grabbed a tightly-relevant cluster.
- **Pushback losses**: #156 (-10 dQ) and #186 (-13.67 dQ) are the two losses with > 10 Q gap. #156 is pushback; #186 is implement. Both kept 10 sections — tailored may have shed context that prose carried.
- **Cost direction**: 9/13 issues are cheaper under tailored. The 4 cost-up issues (#168, #172, #186, #565, #574) cluster on either many-sections-kept (#565: 37, #574: 28) or on multi-file features where read-reread loops dominate (#172, #186).
- **Median Q is essentially tied**: 8/13 dQ values are within ±3 of zero. The signal lives in the tails (#168 win, #186/#156 losses); the median move is small.

## Secondary descriptive cross-tab

Tailored mean dQ + mean dCost against the three other previously-measured arms (per-issue means recovered from prose-vs-* comparison JSONs):

| Comparison arm | mean dQ (tailored − arm) | mean dCost (tailored − arm) | Paired issues |
|---|---:|---:|---:|
| vs prose-baseline | **+1.94** | **−$0.17** | 13 |
| vs specialist | +1.89 | +$0.11 | 13 |
| vs trim (best random subset) | **−15.65** | n/a | 13 |
| vs naive | +1.49 | +$0.09 | 13 |

The 17-point gap to trim that prose-baseline carried ([PR #272](https://github.com/szhygulin/vaultpilot-dev-framework/pull/272)) reproduces here: tailored is 15.65 points below trim (Hedges' g sign favoring trim), broadly matching the prose result. **Random subset trimming continues to outperform every directed-pruning approach tested so far on this 13-issue corpus.**

## Costs

| Phase | Spend |
|---|---:|
| A (Opus selector, parallel=5) | $3.04 |
| C (39 Sonnet cells, parallel=4) | $38.43 |
| D (Opus K=3 grading + tests) | ~$3.50 (Opus grade-reasoning + run-tests harness) |
| **Total** | **~$45** |

Phase A re-runs (4 attempts → $10.82 cumulative) are excluded; only the final clean run cost is counted.

## What's committed

- [`phase-c-results.md`](phase-c-results.md) — this file
- [`phase-c-results.tar.gz`](phase-c-results.tar.gz) — logs-leg{1,2}, scores-leg{1,2}, diffs-leg{1,2}, comparison.json
- [`analyze-tailored-vs-prose.cjs`](analyze-tailored-vs-prose.cjs) — Phase E adapter that handles missing prose raw logs

Local-only (gitignored, regenerable): `research/curve-redo-data/super-agent-tailored/` and `/tmp/tailored-scratch/`.

## Interpretation for the experiment plan

Quoting the plan's success criteria: *"Soft bar: win on either accuracy or cost at unadjusted p < 0.05."* This run does not clear that bar. The directional signal is favorable on both axes, but neither reaches significance with n=13.

What that means in design terms:
- **The per-issue Opus selector works coherently** (Phase A spot-checks confirmed on-topic rationales; #168's +36.83 Q is a clean tailored-wins-by-selecting-the-right-cluster outcome) — the failure mode isn't "selector picks gibberish".
- **The 122-section super-agent file is not significantly richer than the prose-baseline picker that operates on the existing specialist corpus** — at least not richer enough to dominate the noise at n=13.
- **Trim continues to outperform every directed-pruning approach measured.** Future arms targeting the random-subset advantage should probably revisit the "what makes random work that selection doesn't?" question rather than iterate on smarter selectors.

A repeat with K=5 or K=6 (or a corpus of 26 issues with K=3) would tighten the p values toward decision if the same dQ/dCost magnitudes hold — that's a $45-90 follow-on, gated on whether the directional signal is interesting enough to chase.
