# Plan: picker vs. content — discriminate the [#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) negative result

## Context

[PR #255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) ran orchestrator-picked
specialists (10 distinct, picked via enriched-label Jaccard) against the merged
trim baseline on the 13-issue corpus. Result: **specialists scored 17.5 quality
points lower per issue** (Wilcoxon p=0.9941 against H1: specialists better,
Hedges' g = −0.916). Specialists were significantly cheaper (p=0.0127).

The result is consistent with two distinct mechanisms:

- **Picker bad**: tag-Jaccard routes diversely but picks the wrong agent for
  each issue's class. A better picker would surface higher-Q specialists.
- **Content bad**: per-agent evolved `CLAUDE.md` content is net-negative on
  these issues — accumulated lessons interfere with fresh problem-solving.
  No picker can fix this.

Both mechanisms predict the same observed dQ. They predict different
*remediation strategies* (improve the picker vs. trim/reset specialist content),
so we need to discriminate before investing in either fix.

## Design

A single new arm — **naive baseline** — separates the two mechanisms.

- **Arm**: dispatch a freshly-minted general agent (no tags, no per-agent
  `CLAUDE.md` beyond the generic seed in `src/agent/prompt.ts`) against the
  same 13 issues, K=3 replicates per cell. `--skip-summary` keeps the agent
  naive across cells.
- **Comparator**: paired-by-issue against both the trim baseline (existing
  data) and the specialist-redo arm (existing data). 3-way comparison.
- **Metric**: A+B quality formula (judge ∈ 0..50 + hidden-test pass rate ∈
  0..50, or 2A for pushback). Same as [#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255).
- **Test**: paired Wilcoxon, naive vs specialist-redo (H1: naive > specialist
  → content is net-negative); naive vs trim baseline (H1: trim > naive →
  prior history helps).

Decision tree on outcomes:

| Naive vs specialist | Naive vs trim | Conclusion | Next step |
|---|---|---|---|
| naive > specialist (p < 0.05) | any | **Content bad.** Picker fixes won't help. | Trim/reset specialist `CLAUDE.md`s; investigate which sections are net-negative. |
| naive ≈ specialist (no signal) | naive < trim | **Picker bad** + trim helps. | Build oracle picker (per-agent-per-class success rates); rerun. |
| naive < specialist (p < 0.05) | naive < trim | **Both arms beat naive — picker IS adding value, just losing to trim.** | Investigate why trim descendants beat picked specialists. Likely the trim corpus knowledge-leak (caveat #1 in [#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) writeup) — the trim baseline isn't a clean control. |
| naive ≈ specialist ≈ trim | | **No signal.** All three arms tie — either the picker doesn't matter at this issue scale, or A+B is too coarse a metric. | Stop; reframe metric or scope. |

The dominant uncertainty (caveat #1 in [#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255)) is that the trim
baseline's agents are descendants of `agent-916a`, the orchestrator that
originally worked these 13 issues — knowledge leak. The naive arm is a clean
control with **zero issue-specific exposure**. If naive ≥ specialist, the
specialist evolution is the problem regardless of how the picker selects. If
naive < specialist, specialist evolution helps despite the picker being weak.

## Procedure

### Phase A — naive arm (single dispatch, ~$40 + ~$10 judge)

1. **Mint a fresh general agent** outside the experiment registry to avoid
   contaminating the snapshotted state:
   ```bash
   # Snapshot first (mirrors plan #11 from PR #231)
   cp state/agents-registry.json state/agents-registry.snapshot-pre-naive.json
   ```
   Mint via `vp-dev agents mint --name naive-baseline --general` (or the
   equivalent CLI path). Confirm the new agent has empty tags and a
   generic-seed `CLAUDE.md` (≤ a few KB of base content).

2. **Build picks-naive.tsv** mapping every corpus issue to the new agent:
   ```
   issueId<TAB>agentId<TAB>rationale<TAB>score<TAB>leg<TAB>labels
   156<TAB>agent-naive-XXXX<TAB>fresh-general<TAB>0<TAB>1<TAB>
   ...
   ```
   13 rows. No tag-Jaccard scoring needed.

3. **Dispatch** via the parallel dispatcher (PR [#263](https://github.com/szhygulin/vaultpilot-dev-framework/pull/263)) for ~30 min wall:
   ```bash
   bash research/curve-redo-bundle/specialist-redo/prepare-scratch-clones.sh \
     szhygulin/vaultpilot-mcp 4 /tmp/naive-scratch
   bash research/curve-redo-bundle/specialist-redo/prepare-scratch-clones.sh \
     szhygulin/vaultpilot-dev-framework 4 /tmp/naive-scratch

   # OUT_DIR override so the naive arm doesn't clobber the specialist-redo data dir
   OUT_DIR=research/curve-redo-data/naive-baseline \
   SCRATCH_CLONES_DIR=/tmp/naive-scratch \
     bash research/curve-redo-bundle/specialist-redo/dispatch-specialist-redo-parallel.sh 1 --parallel 4
   OUT_DIR=research/curve-redo-data/naive-baseline \
   SCRATCH_CLONES_DIR=/tmp/naive-scratch \
     bash research/curve-redo-bundle/specialist-redo/dispatch-specialist-redo-parallel.sh 2 --parallel 4
   ```

4. **Score** with the existing `score-specialist-redo.sh` against the new
   `OUT_DIR`. ~10 min, ~$10.

5. **Three-way combine** — extend `combine-and-compare.cjs` to accept a third
   arm (or run two pairwise comparisons: naive-vs-trim and naive-vs-specialist).
   The pairwise approach reuses the existing comparator without code changes.

### Phase B — oracle picker arm (conditional, ~$40 + ~$10 judge)

Only fires if Phase A returns "naive ≈ specialist, naive < trim" (decision row
2 in the table above) — meaning the picker IS the bottleneck and naive doesn't
help, so a better picker is the path forward.

1. **Define oracle picker** — for each issue, pick the specialist whose
   historical mean Q on issues with overlapping `decisionClass` + tag-cluster
   is highest. Source: the trim-baseline scores (per-agent per-issue) as a
   proxy for "this agent does well on this class."
2. **Build picks-oracle.tsv** with this routing.
3. **Dispatch + score + combine** as Phase A.

If oracle picker scores ≥ specialist-redo, the picker design is salvageable
and worth investing in. If oracle picker ≈ specialist-redo, even the best
routing can't recover the lost quality and the issue is structural
(content-driven).

## Cost & wall

| Phase | Cells | Dispatch | Judge | **Total** | Wall (parallel-4) |
|---|---:|---:|---:|---:|---:|
| A — naive arm | 39 | ~$32 | ~$8 | **~$40** | ~30 min |
| B — oracle picker (conditional) | 39 | ~$32 | ~$8 | **~$40** | ~30 min |
| **Worst case (A + B)** | 78 | | | **~$80** | ~60 min |

Cost matches the [#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) baseline ($41.21) per arm — same dispatch
shape, same model tier. Defense in depth: per-cell `VP_DEV_MAX_COST_USD=10`,
operator-level monitoring of running totals (parallel-mode aggregate cap is
best-effort).

## Risks (must-handle before dispatch)

1. **Naive agent's `CLAUDE.md` drift**. `--skip-summary` prevents the
   summarizer from rewriting between cells, but ([#248](https://github.com/szhygulin/vaultpilot-dev-framework/issues/248))
   per-cell envelope memory updates still mutate the registry's `tags` and
   `issuesHandled`. Snapshot+restore as in [#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) §11.
2. **Knowledge leak through the seed prompt**. `src/agent/prompt.ts`'s
   generic seed includes general guidance that may already over-specify
   behavior on these issues. Read the seed and document any prior-art
   coupling in the writeup caveats.
3. **Hidden-test contamination across arms**. The same hidden tests apply
   to all arms (B-score is class-fair). No risk of arm-specific test bias.
4. **Naive agent's freshness across replicates**. Verify after Phase A that
   the agent's `CLAUDE.md` mtime didn't change during the run — confirms
   `--skip-summary` worked. If it did drift, the `--no-registry-mutation`
   flag from [#248](https://github.com/szhygulin/vaultpilot-dev-framework/issues/248) is needed before the experiment.

## Verification

- **Pick-time**: `picks-naive.tsv` has 13 rows, all mapping to the same
  `agent-naive-XXXX`, rationale `fresh-general`, score 0.
- **Dispatch-time**: per-leg log count matches expected (6 issues × K=3 = 18
  for leg 1, 7 issues × K=3 = 21 for leg 2). Per-worker logs land in
  `naive-baseline/parallel-worker-<i>.log`.
- **Score-time**: 39 judge.json files. tests.json files for implement-class
  cells with non-empty diffs.
- **Combine-time**: pairwise comparator emits Wilcoxon p for each pair
  (naive vs trim, naive vs specialist). Matrix output:
  ```
                trim     specialist     naive
  trim          —        −17.5***       ?
  specialist    +17.5*** —              ?
  naive         ?        ?              —
  ```
- **Sanity**: per-issue dQ should not be all-zero. Mean coefficient of
  variation across 3 replicates < ~30% per issue.

## Out of scope

- **Implementing the oracle picker as a production code change**. The Phase
  B oracle picker is an *analysis tool*, not a CLI flag. Production picker
  changes (e.g., adding a per-agent-per-class success-rate term to
  `pickAgents()`) are a follow-up if Phase A/B confirms the picker is the
  bottleneck.
- **Re-running the trim baseline at K=3**. Existing K=18 baseline is the
  comparator. Re-running would cost ~$100 with marginal information gain.
- **Larger corpus**. 13 issues is small but sufficient for paired Wilcoxon
  with this effect size. Larger corpus is a separate scoping decision.

## Surfaced by

[PR #255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255)'s negative result (n=13, mean dQ=−17.5, Hedges' g=−0.916).
The user's hypothesis: "orchestrator assigning agents in very inefficient way."
This plan tests whether the picker is the bottleneck OR whether the per-agent
content is the issue, before investing in either fix.
