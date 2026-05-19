# Prose-baseline — full-prose CLAUDE.md picker vs. trim, specialist, naive

Run date: 2026-05-09. Coding cells: Sonnet 4.6. Reasoning judge: Opus 4.7
(K=3 medians). Picker: full-prose LLM dispatcher from
[PR #267](https://github.com/szhygulin/vaultpilot-dev-framework/pull/267)
(`buildTickPrompt` inlines every idle agent's
`agents/<id>/CLAUDE.md` and reads each issue's body, default model
`claude-opus-4-7[1m]`). 5 parallel workers. K=3 replicates per cell, 39
cells. Same 13-issue corpus as
[PR #255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255)
and [PR #269](https://github.com/szhygulin/vaultpilot-dev-framework/pull/269).

Reproducer scripts in
[`research/curve-redo-bundle/specialist-redo/`](specialist-redo/);
arm artifacts under `research/curve-redo-data/prose-baseline/` (gitignored).

## Headline

| Metric | Value |
|---|---|
| Picker (Opus 4.7 1M) | **$3.35** total (2 ticks, ~$1.7/tick) |
| Cells dispatched | 39 (18 leg 1 + 21 leg 2, K=3 each) |
| Total dispatch cost (Sonnet 4.6) | $43.91 (leg 1 $12.06 + leg 2 $31.85) |
| Total judge cost | ~$10 (39 cells × K=3 Opus grades + 30 hidden-test runs) |
| **Total experiment** | **~$57** |
| Wall (parallel-5) | ~75 min including build + score |

## Result: prose picker joins the cluster — does NOT close the gap to trim

The new orchestrator picks specialists from accumulated CLAUDE.md prose
rather than tag-Jaccard. It diversifies aggressively (11 distinct agents
picked across 13 issues, vs. 1 agent for both prior arms) and the picks
read as plausible matches (e.g. agent-de1b "Leslie" — chainlink-oracle,
cross-rpc-divergence — picked for ENS multi-RPC verification on #574). On
quality it changes nothing.

| Comparison | n | mean dQ | Wilcoxon p (H1: dQ > 0) | Hedges' g | Conclusion |
|---|---:|---:|---:|---:|---|
| Prose vs **trim** | 13 | **−17.8** | 0.9960 | −0.916 | Prose much worse than trim |
| Prose vs **specialist-redo** | 13 | −0.31 | 0.4823 | −0.197 | No signal — prose ≈ Jaccard |
| Prose vs **naive** | 13 | −0.70 | 0.9705 | −0.132 | No signal — prose ≈ naive |

| Comparison | mean dCost | Wilcoxon p (H1: dCost < 0) | Conclusion |
|---|---:|---:|---|
| Prose vs trim | +$0.05 | 0.6625 | No cost difference |
| Prose vs specialist-redo | +$0.25 | 0.9989 | Prose **significantly more expensive** |
| Prose vs naive | +$0.23 | 0.9960 | Prose **significantly more expensive** |

Three picker arms (Jaccard, naive, prose) all sit ~17 points below trim,
all within noise of each other. The 17-point gap to trim that PR #255
discovered and PR #269 replicated holds for prose too. Prose costs more
per cell than the prior two arms despite producing equivalent quality —
specialists picked by prose match are not cheaper than a fresh general
agent on these issues.

## Four-arm matrix

|              | trim | specialist | naive | prose |
|---|---:|---:|---:|---:|
| trim         | —     | +17.5  | +17.1 | +17.8 |
| specialist   | −17.5 | —      | +0.08 (n.s.) | +0.31 (n.s.) |
| naive        | −17.1 | −0.08  | —     | +0.70 (n.s.) |
| prose        | −17.8 | −0.31  | −0.70 | — |

Reads: cell `(row, col)` is `mean(row.Q) − mean(col.Q)`. Trim dominates
all three other arms by ~17 points; prose, specialist, and naive cluster
within 1 point of each other.

## Per-issue paired tables

### Prose vs trim baseline (sorted by dQ, ascending)

| Issue | prose Q | trim Q | **dQ** | prose $ | trim $ |
|---:|---:|---:|---:|---:|---:|
| 565 | 25.3 | 67.2 | **−41.8** | $0.43 | $0.26 |
| 178 | 24.2 | 64.2 | **−40.1** | $1.78 | $1.83 |
| 185 | 17.8 | 56.7 | **−38.8** | $2.61 | $2.00 |
| 172 | 17.9 | 54.4 | **−36.5** | $1.83 | $2.00 |
| 574 | 31.0 | 62.2 | **−31.2** | $0.88 | $1.18 |
| 180 | 14.3 | 41.6 | **−27.3** | $2.27 | $1.96 |
| 186 | 27.7 | 42.1 | **−14.4** | $0.85 | $1.09 |
| 665 | 79.3 | 81.4 | −2.1 | $0.16 | $0.15 |
| 156 | 84.0 | 85.6 | −1.6 | $0.18 | $0.20 |
| 157 | 91.5 | 92.0 | −0.5 | $0.53 | $0.52 |
| 168 | 49.7 | 49.9 | −0.3 | $0.75 | $0.71 |
| 162 | 84.0 | 83.3 | +0.7 | $0.18 | $0.21 |
| 649 | 50.0 | 48.2 | +1.8 | $2.18 | $1.91 |

Same two-cluster shape as PRs #255 and #269: 6 pushback / launch-breadcrumb
/ gate issues at parity (dQ ∈ [−2.1, +1.8]); 7 implement-class issues with
non-trivial diff surfaces lose to trim by 14-42 points.

### Prose vs naive (sorted by dQ, ascending)

| Issue | prose Q | naive Q | dQ |
|---:|---:|---:|---:|
| 565 | 25.3 | 34.3 | **−9.0** |
| 185 | 17.8 | 21.5 | −3.7 |
| 665 | 79.3 | 81.3 | −2.0 |
| 156 | 84.0 | 86.0 | −2.0 |
| 162 | 84.0 | 86.7 | −2.7 |
| 178 | 24.2 | 25.9 | −1.7 |
| 168 | 49.7 | 51.0 | −1.3 |
| 574 | 31.0 | 32.0 | −1.0 |
| 157 | 91.5 | 92.3 | −0.8 |
| 649 | 50.0 | 50.2 | −0.2 |
| 172 | 17.9 | 17.9 | −0.0 |
| 180 | 14.3 | 12.7 | +1.7 |
| 186 | 27.7 | 14.0 | **+13.7** |

Range −9.0 to +13.7. Prose loses to naive on 11 of 13 issues, by small
margins (median dQ −1.5). The +13.7 outlier on #186 mirrors the
specialist-redo arm's same-direction outlier (Calldata Decode scored
+13.7 above naive on #186 in PR #269). The picker on prose-baseline picked
agent-200f "Shannon" — a fresh general agent (issuesHandled=0) — for #186,
making that cell effectively a second naive replicate; the +13.7 is
within the noise of the naive arm itself rather than a prose advantage.
Without #186, prose vs naive tightens to mean dQ ≈ −1.9.

### Prose vs specialist-redo (sorted by dQ, ascending)

| Issue | prose Q | specialist Q | dQ |
|---:|---:|---:|---:|
| 665 | 79.3 | 82.7 | −3.3 |
| 178 | 24.2 | 26.7 | −2.5 |
| 565 | 25.3 | 27.7 | −2.3 |
| 157 | 91.5 | 91.7 | −0.2 |
| 168 | 49.7 | 49.7 | 0.0 |
| 186 | 27.7 | 27.7 | 0.0 |
| 172 | 17.9 | 17.7 | +0.2 |
| 180 | 14.3 | 14.0 | +0.3 |
| 185 | 17.8 | 17.3 | +0.5 |
| 156 | 84.0 | 83.3 | +0.7 |
| 162 | 84.0 | 83.3 | +0.7 |
| 574 | 31.0 | 30.3 | +0.7 |
| 649 | 50.0 | 48.6 | +1.4 |

Range −3.3 to +1.4. Mean dQ −0.31, median 0.2. The Wilcoxon n=11 (two
zero-difference issues dropped) and p=0.4823 — straight tie.

## Decision-tree mapping (against PR #265 plan)

The plan's decision tree was written for the naive arm (vs. specialist /
trim). Mapping the prose arm into the same shape:

| Prose vs naive | Prose vs trim | Reading |
|---|---|---|
| **prose ≈ naive** | **prose < trim** | Same row as the naive arm landed in. The picker is not the bottleneck — even an LLM dispatcher reading every agent's full prose can't differentiate quality. **Caveat #1 from PR #255 stands**: the trim baseline is contaminated by issue-specific exposure, and no picker among existing specialists can close that gap. |

The result rules out one specific reading of PR #269: that the Jaccard
picker was "too dumb" to find the right specialist. A prose-aware picker
with full agent context didn't close the gap either. The dominant
explanation remains: trim agents (descendants of `agent-916a`, the
orchestrator that originally worked these 13 issues) carry direct prior
exposure that no other arm has.

## Picks distribution (prose arm)

11 distinct agents picked across 13 issues — strong diversification vs.
the prior arms. Two agents picked twice each (`agent-9a77` for #162/#168,
`agent-92ff` for #185/#649).

| Issue | Picked agent | Plausible-fit signal |
|---:|---|---|
| 156 | agent-5acc Raman | Solana/MarginFi prose |
| 162 | agent-9a77 Alan | bake-window/dependency-tracker prose |
| 565 | agent-02ce Markov | chain-data-integrity, cross-rpc-divergence |
| 574 | agent-de1b Leslie | chainlink-oracle, cross-rpc-divergence |
| 649 | agent-92ff Alonzo | generalist (37 issues handled) |
| 665 | agent-ef41 Issue Lifecycle Hygiene | architectural-close, advisory-prose |
| 157 | agent-fe90 Cook | advisory-routing, access-control |
| 168 | agent-9a77 Alan | claude-md-tightening |
| 172 | agent-7089 Saunders | advisory-prose, advisory-only |
| 178 | agent-a9a6 Faraday | lesson-utility-scoring |
| 180 | agent-abd6 Charles | audit-trail, zod-schema-extension |
| 185 | agent-92ff Alonzo | adversarial-smoke-test, audit-lessons |
| 186 | agent-200f Shannon | fresh general (issuesHandled=0) |

The picks are not random and not collapsed — the LLM is reading prose and
making coherent choices. The choices just don't translate to better Q on
this corpus.

## Caveats

1. **Trim baseline still contaminated.** The 17-point delta to trim
   replicates exactly across all three picker arms. Caveat #1 from
   PR #255 is now quantitative: trim's advantage is a near-constant
   ~17 points, independent of the picking strategy below it. The clean
   counterfactual ("freshly-mint K specialists, give them N issues
   each in unrelated topical territory") suggested in PR #269's
   §"Phase B'" remains the right next experiment if the goal is to
   isolate "issue-specific exposure" from "specialist-evolution-in-general".

2. **Prose costs more per coding cell.** Prose-picked specialists
   averaged ~$0.25 more per cell than the naive agent on the same
   issues. Plausible mechanism: the prose-picked specialist's larger
   `agents/<id>/CLAUDE.md` (median ~17 KB) lengthens every Sonnet
   coding turn vs. the naive agent's GENERIC_SEED-only ~1 KB. The
   coding-time cost-quality trade-off is net-negative here — pay more,
   get the same answer.

3. **Picker tick was cheap (~$1.7).** PR #267's commit message estimated
   $10-15 per dispatch tick on full agent sets. We measured $1.5-1.8 per
   tick at 47 idle agents and 6-7 issues. Possibly because cap=#issues
   constrained the LLM's output to a small JSON, and the prompt-cache
   benefit of stable agent prose is real. The picker is not the cost
   driver — the coding cells are.

4. **n=13, K=3.** Same statistical-power caveat as the prior arms.
   Wilcoxon at this effect size is near-detection for null effects;
   prose vs naive p=0.9705 reflects a small consistent loss across
   issues, not a flat tie. Larger corpus would tighten the comparison
   but would not change the conclusion at this magnitude.

5. **Mixed-repo picker calls.** Issues span vaultpilot-mcp (leg 1) and
   vaultpilot-dev-framework (leg 2). The picker was called twice — once
   per repo — passing the matching `targetRepoPath` so each agent's
   CLAUDE.md was deduped against the right project seed. This matches
   production single-target-repo behavior; an alternative single-call
   variant (one repo seed for both legs) is unlikely to materially shift
   picks given the prose was the dominant signal.

## Files

- [`prose-vs-trim.json`](../curve-redo-data/prose-baseline/prose-vs-trim.json)
  (gitignored at runtime) — paired Wilcoxon vs. trim baseline.
- [`prose-vs-specialist.json`](../curve-redo-data/prose-baseline/prose-vs-specialist.json)
  (gitignored) — paired Wilcoxon vs. specialist-redo arm.
- [`prose-vs-naive.json`](../curve-redo-data/prose-baseline/prose-vs-naive.json)
  (gitignored) — paired Wilcoxon vs. naive arm.
- [`picks-prose.tsv`](../curve-redo-data/prose-baseline/picks-prose.tsv)
  (gitignored) — 13 rows, prose-llm rationale, 11 distinct agents.
- [`logs-leg{1,2}/`](../curve-redo-data/prose-baseline/) (gitignored) —
  18 + 21 cell logs.
- [`scores-leg{1,2}/`](../curve-redo-data/prose-baseline/) (gitignored) —
  39 judge.json + 30 tests.json.
- [`pick-prose.cjs`](specialist-redo/pick-prose.cjs) — calls
  `dispatch()` (the new prose dispatcher) as a library; one tick per
  repo group; writes `picks-prose.tsv`.

## Phase decision

PR #265 §"Phase B" gated an oracle-picker arm on the same row prose
landed in (naive ≈ specialist, naive < trim). PR #269 declined Phase B
on the same evidence. This third arm makes the case stronger: the
caveat-#1-aware reading is empirically supported across three
independent picking strategies. Building an oracle picker on top would
not close the gap; the gap is in the comparator, not the picker.

The follow-up worth running is the **clean-baseline arm** (PR #269
§"Phase B'"): freshly-mint K specialists on unrelated topical
territory, then dispatch them against the 13-issue corpus. If those
score like naive (~17 below trim), caveat #1 is confirmed empirically
and the 17-point delta becomes "issue-specific exposure premium" rather
than a routing or content question. Cost ~$80 + ~$10 judge.
