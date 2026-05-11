# Super-agent-tailored v2 — two-pass selector + compression

Run date: 2026-05-11. Hypothesis from prior analysis ([#289](https://github.com/szhygulin/vaultpilot-dev-framework/pull/289)): constrain the selector (more aggressive adversarial discrimination) and compress the per-issue prompts (strip non-directive auxiliary content) to tighten the directional signal that didn't reach p<0.05 at n=13.

**Result: zero meaningful improvement on any axis.** v2 vs v1 is flat across judge-A, tests-B, combined-Q, and cost. v2 vs prose-baseline produces the same pattern as v1: cost direction nominally favorable (p=0.081 vs v1's 0.104), quality direction unchanged (p=0.444 vs v1's 0.242).

## Changes from v1

| Change | What | Why |
|---|---|---|
| **Two-pass selector** | Pass 1: score 0..100 per section + 1-line rationale (all 122 sections). Pass 2: adversarial review of borderline band (score 31..69), default to keep when ambiguous. | Test the hypothesis that v1's single-pass selector over-included on cross-cutting issues (#565 kept 37/122, #574 kept 28) and under-included on losses (#186 -13.67 dQ kept 10). |
| **Phase B compression** | Strip `<!-- promote-candidate:* -->` annotation blocks (53 of them, 16% of file size). Super-agent has no Past-incident blocks (already pruned upstream by build-super-agent.cjs); promote-candidate is the structural analog. | Cut prompt size by 30-50% on the kept sections without losing directive content. |
| **Symmetric compression** | Selector and minter both see compressed sections (selector's input = what agent will receive). | Avoid the failure mode where selector keeps a section "because of the promote-candidate annotation" that won't reach the agent. |

Implementation: [`score-and-review-rules.cjs`](score-and-review-rules.cjs) replaces `select-rules.cjs`. [`build-tailored-agents.cjs`](build-tailored-agents.cjs) gains `--compress` and `--agent-prefix` flags. v2 agents are minted as `agent-super-tailored-v2-<issueId>`.

## Selection distribution (v1 vs v2)

| Issue | v1 keep | v2 keep | Δ | v2 autoKeep / borderline / autoDrop |
|---:|---:|---:|---:|---|
| 156 | 10 | 9 | -1 | 3 / 7 / 112 |
| 157 | 7 | **4** | **-3** | 1 / 6 / 115 |
| 162 | 6 | **4** | -2 | 2 / 5 / 115 |
| 168 | 10 | 8 | -2 | 2 / 6 / 114 |
| 172 | 17 | 18 | +1 | 6 / 19 / 97 |
| 178 | 16 | 20 | +4 | 2 / 24 / 96 |
| 180 | 13 | 18 | +5 | 10 / 14 / 98 |
| 185 | 17 | 17 | 0 | 5 / 24 / 93 |
| **186** | **10** | **4** | **-6** | 0 / 8 / 114 |
| 565 | 37 | 36 | -1 | 21 / 25 / 76 |
| 574 | 28 | 30 | +2 | 19 / 18 / 85 |
| **649** | **21** | **16** | **-5** | 4 / 15 / 103 |
| 665 | 15 | 14 | -1 | 6 / 12 / 104 |

Two-pass produced sharper changes on a few issues (#186 10→4, #649 21→16, #157 7→4) where the adversarial review dropped sections the single-pass had kept. Big-prompt issues (#565, #574) barely budged — the auto-keep band (score≥70) was already large enough that Pass 2 had little surface to work on.

## Costs

| Phase | v1 | v2 |
|---|---:|---:|
| A (selector) | $3.04 (1-pass, parallel=5) | $4.11 (2-pass, parallel=5) |
| C (dispatch, 39 cells) | $38.43 | $38.53 |
| D (grading + tests) | ~$3.50 | ~$3.50 |
| **Total** | **~$45** | **~$46** |

The two-pass selector cost 35% more than the single-pass ($1.07 marginal) but stays well within the Phase A budget.

## Three-axis decomposition

Quality scoring formula: implements contribute A (judge median, 0-50) + B (test pass rate × 50, 0-50); pushbacks contribute 2A. v1 and v2 both have raw per-cell A/B; prose-baseline only has aggregate combined Q (raw cells were gitignored under [#272](https://github.com/szhygulin/vaultpilot-dev-framework/pull/272) and didn't survive). v2 vs v1 can therefore be analyzed on all three axes; v2 vs prose is restricted to combined Q + cost.

### v2 vs v1 — paired Wilcoxon + bootstrap CIs

| Axis | n | Wilcoxon p | Bootstrap mean Δ | 95% CI | Verdict |
|---|---:|---:|---:|---|---|
| Judge-A (H1: v2 > v1) | 13 | 0.281 | -0.029 | [-1.69, +1.33] | flat |
| Tests-B (H1: v2 > v1) | 10 | 0.624 | +0.11 | [-0.41, +0.76] | flat |
| Combined Q (H1: v2 > v1) | 13 | 0.363 | -0.74 | [-5.33, +3.31] | flat |
| Cost (H1: v2 < v1) | 13 | 0.610 | +$0.003 | [-$0.08, +$0.08] | flat |

Fisher combination (A + B): χ²(4) = 3.48, p = 0.481. Fisher (Q + cost): χ²(4) = 3.01, p = 0.556.

**No axis shows meaningful improvement over v1.** Bootstrap means are tightly clustered around zero with CIs that straddle. The two-pass + compression change set has near-zero net effect.

### v2 vs prose-baseline — paired Wilcoxon + bootstrap CIs

| Axis | n | Wilcoxon p | Bootstrap mean Δ | 95% CI | Verdict |
|---|---:|---:|---:|---|---|
| Combined Q (H1: v2 > prose) | 13 | 0.444 | +1.47 | [-4.03, +8.50] | flat |
| Cost (H1: v2 < prose) | 13 | **0.081** | -$0.137 | [-$0.30, +$0.02] (barely straddles 0) | direction p<0.10, doesn't cross 0.05 |

Fisher (Q + cost): χ²(4) = 6.65, p = 0.156.

v2 vs prose **roughly tracks v1 vs prose**:

| Comparison | v1 vs prose | v2 vs prose | Change |
|---|---:|---:|---|
| Quality Wilcoxon p | 0.242 | 0.444 | **worse** (Q signal diluted) |
| Quality bootstrap mean | +1.94 | +1.47 | slightly weaker |
| Cost Wilcoxon p | 0.104 | 0.081 | slightly tighter |
| Cost bootstrap mean | -$0.140 | -$0.137 | unchanged |
| Cost bootstrap 95% CI | [-$0.275, -$0.012] | [-$0.302, +$0.024] | slightly wider (now straddles) |

The cost direction is marginally tighter (Wilcoxon p 0.104 → 0.081) but the bootstrap CI on cost shifted slightly UP and now barely includes zero — these are essentially the same result with different sample noise. Quality got slightly worse.

## Per-issue swings (v2 vs v1, by absolute dQ)

| Issue | v1 Q | v2 Q | ΔQ | v1 vs prose dQ | v2 vs prose dQ | Interpretation |
|---:|---:|---:|---:|---:|---:|---|
| **665** | 82.7 | 61.8 | **-20.9** | +3.33 | -17.55 | v2 broke a working pushback — at least one cell tried to implement (B=9.5 in v2, none in v1) |
| **186** | 14.0 | 26.7 | **+12.7** | -13.67 | -1.00 | v2 recovered v1's biggest loss; selector dropped 6 sections (10→4) and freed signal |
| **574** | 36.7 | 22.7 | **-14.0** | +5.67 | -8.33 | v2 lost ground; selector kept 30 sections (v1: 28) but discrimination was worse |
| 168 | 86.5 | 84.7 | -1.8 | +36.83 | +35.00 | preserved the big win — selector kept the right cluster on both |
| 178 | 17.4 | 21.6 | +4.2 | -6.73 | -2.55 | partial recovery |
| Others | — | — | ≤±3.5 | — | — | within noise |

Net: v2 redistributed the variance — recovered #186, broke #665 — but didn't move the aggregate signal. The two-pass adversarial discrimination produces different selections (#186 went 10→4; #649 21→16) but the change in selection doesn't translate to a robust quality lift at this n.

## Interpretation

The two-pass + compression hypothesis was: **v1's lenient discrimination dilutes signal**. If that were correct, v2 should show:
1. Reduced quality variance across issues (tighter discrimination)
2. Higher mean dQ vs prose (cleaner selections)
3. Lower cost (compressed prompts reduce per-cell tokens)

None of these materialized:
1. **Per-issue Q variance is similar to v1** — same range (#168 high, #180 low), with redistribution (#186 up, #665 down) rather than tightening.
2. **Mean dQ vs prose dropped slightly** (1.94 → 1.47).
3. **Cost is essentially identical** (mean dCost vs prose: -$0.140 v1 → -$0.137 v2). Compression saved bytes in the prompt but the cells didn't show meaningful cost reduction — the cost signal lives in agent turn count and tool-call depth, not raw prompt-byte count at this size.

**Conclusion for the chase**: methodology refinements at n=13 don't move the needle. The directional signal from v1 (cost favorable, quality favorable) is reproducible but stuck at the same effect-size as v1. The only paths likely to cross p<0.05 are:

1. **Expand the corpus** — Wilcoxon at n=26 with the same magnitudes projects cost p ≈ 0.03, quality p ≈ 0.13-0.15.
2. **Implement-only expansion** — the implement-subset cost test was tightest in v1 (n=9, p=0.096); doubling to n=18 implements projects p ≈ 0.03.
3. **Accept the bootstrap-cost finding as the result** — v1's 95% CI on dCost mean excluded zero ([-$0.275, -$0.012]). v2 is consistent with this (CI [-$0.30, +$0.024] — slightly wider but same direction and mean). At the level of "tailored saves cost vs prose", the answer is yes; at the level of "win on the soft-bar with Wilcoxon p<0.05", the answer is no with neither methodology nor data refinement.

## What's committed

- [`phase-c-v2-results.md`](phase-c-v2-results.md) — this file
- [`phase-c-v2-results.tar.gz`](phase-c-v2-results.tar.gz) — v2 logs/scores/diffs/comparison-v2.json
- [`score-and-review-rules.cjs`](score-and-review-rules.cjs) — two-pass selector
- [`analyze-tailored-v2.cjs`](analyze-tailored-v2.cjs) — three-axis analyzer (v2 vs v1 vs prose)
- Modified [`build-tailored-agents.cjs`](build-tailored-agents.cjs) — `--compress` and `--agent-prefix` flags

Local-only state (gitignored, regenerable): `research/curve-redo-data/super-agent-tailored-v2/`, `agents/agent-super-tailored-v2-*/`.

## Per-issue table

Per-issue means across K=3 replicates per arm, all three axes:

| Issue | v2 A | v1 A | dA | v2 B | v1 B | dB | v2 Q | v1 Q | prose Q | v2 cost | v1 cost | prose cost |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 156 | 40.0 | 37.0 | +3.0 | n/a | n/a | n/a | 80.0 | 74.0 | 84.0 | $0.20 | $0.15 | $0.18 |
| 157 | 43.3 | 43.3 | 0.0 | 49.5 | 49.0 | +0.5 | 92.8 | 92.3 | 91.5 | $0.46 | $0.36 | $0.53 |
| 162 | 42.3 | 42.7 | -0.3 | n/a | n/a | n/a | 84.7 | 85.3 | 84.0 | $0.14 | $0.14 | $0.18 |
| 168 | 42.0 | 43.0 | -1.0 | 42.7 | 43.5 | -0.8 | 84.7 | 86.5 | 49.7 | $0.85 | $0.77 | $0.75 |
| 172 | 42.0 | 42.0 | 0.0 | 15.7 | 15.2 | +0.5 | 19.2 | 19.4 | 17.9 | $2.28 | $2.07 | $1.83 |
| 178 | 39.0 | 37.0 | +2.0 | 24.8 | 22.3 | +2.5 | 21.6 | 17.4 | 24.2 | $1.30 | $1.32 | $1.78 |
| 180 | 42.0 | 41.0 | +1.0 | 0.0 | 0.0 | 0.0 | 14.0 | 13.3 | 14.3 | $1.91 | $1.72 | $2.27 |
| 185 | 42.0 | 40.0 | +2.0 | 15.5 | 16.0 | -0.5 | 19.2 | 18.7 | 17.8 | $2.03 | $2.10 | $2.61 |
| 186 | 41.0 | 41.7 | -0.7 | 0.0 | 0.0 | 0.0 | 26.7 | 14.0 | 27.7 | $0.73 | $0.90 | $0.85 |
| 565 | 34.0 | 30.7 | +3.3 | 3.0 | 3.0 | 0.0 | 37.0 | 33.7 | 25.3 | $0.47 | $0.48 | $0.43 |
| 574 | 20.0 | 22.7 | -2.7 | 14.0 | 14.0 | 0.0 | 22.7 | 36.7 | 31.0 | $0.73 | $0.90 | $0.88 |
| 649 | 28.7 | 27.7 | +1.0 | 22.4 | 23.6 | -1.1 | 51.1 | 51.2 | 50.0 | $1.47 | $1.75 | $2.18 |
| 665 | 33.3 | 41.3 | -8.0 | 9.5 | n/a | n/a | 61.8 | 82.7 | 79.3 | $0.29 | $0.14 | $0.16 |

"n/a" for B: no implement-decision cells in that issue×arm combination, or all such cells had apply-errors.
