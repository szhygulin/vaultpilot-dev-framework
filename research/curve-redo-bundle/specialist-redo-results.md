# Curve-redo specialist follow-up — results

Run date: 2026-05-08. Coding cells: Sonnet 4.6. Reasoning judge: Opus 4.7 (K=3 medians).
Targets: `szhygulin/vaultpilot-mcp` (leg 1, 6 open issues, vitest) +
`szhygulin/vaultpilot-dev-framework` (leg 2, 7 closed issues, node-test).
Picker-routed specialists × K=3 replicates = 39 cells. Compared paired-by-issue
against the merged trim baseline (232 cells; one cell `error_max_turns` in
baseline excluded).

Tarball: [`research/curve-redo-bundle/specialist-redo-results.tar.gz`](specialist-redo-results.tar.gz)
(gitignored at runtime under `research/curve-redo-data/`). Reproducer scripts
in [`research/curve-redo-bundle/specialist-redo/`](specialist-redo/).

## Headline

| Metric | Value |
|---|---|
| Cells dispatched | 39 (18 leg 1 + 21 leg 2, K=3 each) |
| Total dispatch cost | $34.13 (leg 1 $10.59 + leg 2 $23.54) |
| Total judge cost | $7.08 |
| **Total experiment** | **~$41.21** |
| Cell wall (leg 1 serial) | ~60 min |
| Cell wall (leg 2 serial) | ~129 min |
| Picks distribution | 10 distinct specialists (Sofia/Alan/Markov/Leslie/agent-92ff/Saunders/Cook×2/Faraday×3/Hipparchus/Calldata Decode) |

## Result: hypothesis REJECTED

Plan §"Hypothesis": *per-issue mean Q (specialist arm) > per-issue mean Q (trim arm),
paired Wilcoxon `alternative="greater"`, n=13.*

| Test | n | Statistic | p | Conclusion |
|---|---:|---|---:|---|
| Wilcoxon (quality, H1: dQ > 0) | 13 | w⁺=10, z=−2.52 | **0.9941** | strongly rejects "specialists better" |
| Wilcoxon (cost, H1: dCost < 0) | 13 | w⁺=13, z=−2.24 | **0.0127** | specialists significantly cheaper |
| Hedges' g (quality) | | −0.916 | | large negative effect size |

Mean dQ across 13 paired issues: **−17.5** (specialists score 17.5 quality
points lower per issue). Mean dCost: **−$0.20** (specialists ~20¢ cheaper
per cell).

## Per-issue paired table (sorted by dQ, ascending)

| Issue | Picked agent | treat Q | base Q | **dQ** | treat $ | base $ | dCost | CV(Q) |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 565 | Markov (`02ce`) | 27.7 | 67.2 | **−39.5** | $0.43 | $0.26 | +$0.18 | 0.25 |
| 185 | Hipparchus (`b7b8`) | 17.3 | 56.7 | **−39.3** | $1.47 | $2.00 | −$0.53 | 1.73 |
| 178 | Faraday (`a9a6`) | 26.7 | 64.2 | **−37.6** | $1.65 | $1.83 | −$0.18 | 1.73 |
| 172 | Cook (`fe90`) | 17.7 | 54.4 | **−36.7** | $1.11 | $2.00 | −$0.89 | 1.73 |
| 574 | Leslie (`de1b`) | 30.3 | 62.2 | **−31.9** | $0.71 | $1.18 | −$0.47 | 0.10 |
| 180 | Faraday (`a9a6`) | 14.0 | 41.6 | **−27.6** | $1.94 | $1.96 | −$0.02 | 1.73 |
| 186 | Calldata Decode (`d0eb`) | 27.7 | 42.1 | **−14.4** | $0.71 | $1.09 | −$0.38 | 0.87 |
| 156 | Sofia (`2a3d`) | 83.3 | 85.6 | −2.2 | $0.13 | $0.20 | −$0.07 | 0.01 |
| 157 | Cook (`fe90`) | 91.7 | 92.0 | −0.3 | $0.35 | $0.52 | −$0.17 | 0.01 |
| 168 | Faraday (`a9a6`) | 49.7 | 49.9 | −0.3 | $0.62 | $0.71 | −$0.09 | 0.02 |
| 162 | Alan (`9a77`) | 83.3 | 83.3 | +0.1 | $0.19 | $0.21 | −$0.02 | 0.01 |
| 649 | agent-92ff (`92ff`) | 48.6 | 48.2 | +0.4 | $1.99 | $1.91 | +$0.08 | 0.07 |
| 665 | Saunders (`7089`) | 82.7 | 81.4 | +1.2 | $0.13 | $0.15 | −$0.02 | 0.03 |

**Two clusters:** the 6 issues where dQ ∈ [−2.2, +1.2] (statistical tie) are all
pushback-class or near-pushback (#156/#162/#665 pure pushback; #157 launch-breadcrumb
where both arms scored Q ≈ 92; #168 pair-clusters; #649 cost-preview where
agent-92ff was picked in both arms). The 7 issues where dQ ≤ −14 are all
implement-class with non-trivial diff surfaces. Specialists implement worse and
implement cheaper.

## Methodology — picker collapse + label enrichment

Plan §"Findings from picker dry-run" (committed in [PR #231](https://github.com/szhygulin/vaultpilot-dev-framework/pull/231))
documented the unenriched picker result: all 13 issues map to a single agent
(`agent-92ff` "Alonzo") with score 0.1792. Mechanism (verified against
[`src/orchestrator/orchestrator.ts:439`](https://github.com/szhygulin/vaultpilot-dev-framework/blob/main/src/orchestrator/orchestrator.ts#L439)):

```ts
score = jaccard(agent.tags, issue.labels) + 0.05 * Math.log(1 + agent.issuesHandled);
```

8 of 13 issues had 0 GH labels (closed leg-2 issues); the remaining 5 had
1–2 labels with no agent's tag set overlapping much. The recency bump
`0.05 * log(1 + 35) = 0.179` for agent-92ff dominates Jaccard for every cell.

This run picked **Option 2** from the plan: enrich corpus labels. Per-issue
label sets in [`research/curve-redo-bundle/specialist-redo/enriched-labels.json`](specialist-redo/enriched-labels.json),
designed against each topical specialist's tag set vs. agent-92ff's 113-tag
superset. Verified by a local scorer before commit. Picker route post-enrichment:

| Issue | Agent | Pick score | beats agent-92ff by |
|---:|---|---:|---:|
| 156 | Sofia | 0.246 | +0.040 |
| 162 | Alan | 0.203 | +0.024 |
| 565 | Markov | 0.253 | +0.066 |
| 574 | Leslie | 0.247 | +0.069 |
| 649 | agent-92ff | 0.188 | (kept — strongest tag-overlap territory) |
| 665 | Saunders | 0.206 | +0.018 |
| 157 | Cook | 0.209 | +0.030 |
| 168 | Faraday | 0.303 | +0.115 |
| 172 | Cook | 0.209 | +0.030 |
| 178 | Faraday | 0.382 | +0.203 |
| 180 | Faraday | 0.303 | +0.124 |
| 185 | Hipparchus | 0.201 | +0.022 |
| 186 | Calldata Decode | 0.191 | +0.012 |

[`pick-specialists.cjs --labels-override`](specialist-redo/pick-specialists.cjs)
merges enriched labels with live `gh issue view --json labels` (deduped); the
flag is the operator-visible knob if future runs need a different routing.

## Tooling state — 3 issues surfaced and filed

The dispatch path exposed three latent infrastructure bugs, all filed during
the run:

- [#248](https://github.com/szhygulin/vaultpilot-dev-framework/issues/248) — `--skip-summary` doesn't suppress per-run registry mutations
  (`issuesHandled++`, `addTags`, `lastActiveAt`). Plan §11's snapshot+restore
  was the workaround; proposed `--no-registry-mutation` flag for research
  dispatchers.
- [#253](https://github.com/szhygulin/vaultpilot-dev-framework/issues/253) — `applyReplayRollback` strips `origin` from the **shared** `.git/config`,
  breaking every subsequent `--replay-base-sha` cell on the same clone.
  Workaround: runner re-adds origin idempotently before each cell.
- [#254](https://github.com/szhygulin/vaultpilot-dev-framework/issues/254) — Dispatch scripts don't fall back to `$HOME/dev/vaultpilot/<name>` when
  `$HOME/dev/<name>` is missing — surfaced after the recent `vaultpilot-development-agents → vaultpilot-dev-framework`
  rename left the outer back-compat symlink at the old name only.

None of the three affect scientific outcome — the runs completed, the cells
produced valid envelopes, the judge graded normally. They are operator-side
ergonomics + a real `git remote` mutation bug.

## Caveats

1. **Knowledge leak in the baseline.** The trim agents are descendants of `agent-916a`,
   which was the orchestrator that originally worked through these 13 issues
   when they were first opened/closed. Even the 6 KB-trimmed CLAUDE.mds carry
   downstream lessons from that work. The trim baseline isn't a naive control;
   it's "agents that have seen these exact issues before, with varying prompt
   density." A clean negative result would require freshly-minted general
   agents with no prior issue exposure as the comparator. **The dQ result
   should be read as "evolved per-agent CLAUDE.md vs. trimmed parent CLAUDE.md
   on the SAME issues" — not as "specialists vs. naive agents."**

2. **Picker routes by tag-overlap, not by demonstrated competence.** The
   enrichment intentionally chose labels that overlap with each specialist's
   tag set. But tag overlap reflects what the agent has *worked on*, not what
   it's *good at*. For example, Markov on #565 (data-source-attestation,
   provenance-footer) has tags from prior MCP-data-plane reasoning work but
   may not have stronger code-implementation skills than a generic trim. The
   picker's Jaccard signal is necessary for routing diversity but is not a
   proxy for outcome quality.

3. **Methodology asymmetry between legs.** Leg 1 ran serial (one cell at a
   time, ~1.9 min/cell average). Leg 2 ran serial after a parallel-3 attempt
   failed on `git worktree add` lock contention against the single
   vaultpilot-dev-framework clone (see [#254](https://github.com/szhygulin/vaultpilot-dev-framework/issues/254)
   thread for the parallelism follow-up question). Wall-time differs across
   legs but per-cell quality is independent of dispatch parallelism, so the
   paired-by-issue comparison is not biased by the asymmetry.

4. **Decision-class drift on #574.** Corpus marks #574 (ENS resolution multi-RPC
   verification) as `pushback`, but Leslie chose `implement` in the treatment
   arm (substantial diffs, ~5 min cells, $0.71 mean cost). The judge graded
   the implementation; A+B mapping applies. Could be specialist-side
   over-confidence or correct re-classification — the writeup doesn't
   adjudicate.

5. **Test-pass-rate denominator.** Vitest's "Tests" line counts only tests in
   non-erroring files. Files that fail at import/compile contribute 0 to both
   `passed` and `total`. Same caveat as leg-1 baseline; B-score should be read
   as "of tests that ran, fraction that passed", not "of all hidden tests."

## What this changes

- **The original "evolved-CLAUDE.md is better" hypothesis is rejected with
  large effect size.** On this 13-issue corpus, against this baseline, with
  this picker, treatment cells score ~17.5 points lower on Q (median).

- **Specialists are cheaper.** The cost win is real (Wilcoxon p=0.013) and
  driven by faster decisions in implement-class cells. Specialists either
  reach pushback faster (where applicable) or commit to a narrower implement
  surface than trim agents. This is a use-case-relevant finding even if the
  quality direction was unexpected.

- **The picker design needs scrutiny if used for routing-by-quality.**
  Tag-overlap routes diversely but doesn't predict outcome quality on this
  corpus. Future work: combine tag-overlap with a per-agent-per-class success
  rate signal, or restrict specialist routing to agents with a track record
  on the same issue class.

- **Caveat #1 is the dominant alternative explanation.** The next experiment
  worth running is the same comparison with naive (no prior history) general
  agents as the baseline arm. If specialists still lose to naive agents, the
  signal is robust. If specialists beat naive agents but lose to trim
  descendants, the result is "trim-pruned descendants > evolved specialists,
  on issues both have seen" — a different and narrower claim.
