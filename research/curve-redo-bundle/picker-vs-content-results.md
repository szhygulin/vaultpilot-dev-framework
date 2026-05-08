# Picker vs. content — discriminate the [#255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) negative result

Run date: 2026-05-08. Coding cells: Sonnet 4.6. Reasoning judge: Opus 4.7 (K=3 medians).
Naive arm: one freshly-minted general agent (`agent-8274` "Wallis", tags=`["general"]`,
GENERIC_SEED-only CLAUDE.md, 1179 bytes) dispatched against the same 13-issue corpus
as [PR #255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255), K=3 replicates per cell, 39 cells total. Plan:
[`feature-plans/picker-vs-content-experiment-plan.md`](../../feature-plans/picker-vs-content-experiment-plan.md)
(merged via [PR #265](https://github.com/szhygulin/vaultpilot-dev-framework/pull/265)).

Reproducer scripts in [`research/curve-redo-bundle/specialist-redo/`](specialist-redo/);
naive-arm artifacts under `research/curve-redo-data/naive-baseline/` (gitignored).

## Headline

| Metric | Value |
|---|---|
| Cells dispatched | 39 (18 leg 1 + 21 leg 2, K=3 each) |
| Total dispatch cost | $34.83 (leg 1 $8.50 + leg 2 $26.33) |
| Total judge cost | ~$10 (39 cells × K=3 Opus grades + 21 hidden-test runs) |
| **Total experiment** | **~$45** |
| Wall (parallel-4) | ~80 min including bug-fix retries |

## Result: picker is not the bottleneck, content is not net-negative

The plan's two competing hypotheses (picker bad vs. content bad) both predict
naive ≠ specialist. The data says **naive ≈ specialist**: a fresh general agent
scores statistically indistinguishable from a Jaccard-routed specialist on the
same 13 issues. The 17.5-point gap from [PR #255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) is replicated here as
17.1 points naive-vs-trim, but it does NOT reproduce in naive-vs-specialist —
both arms beat naive by zero, both lose to trim by ~17.

| Comparison | n | mean dQ | Wilcoxon p (H1: dQ > 0) | Hedges' g | Conclusion |
|---|---:|---:|---:|---:|---|
| Naive vs **trim** baseline | 13 | **−17.1** | 0.9654 | −0.896 | Naive much worse than trim |
| Naive vs **specialist-redo** | 13 | +0.077 | 0.0921 | +0.077 | No signal — naive ≈ specialist |

| Comparison | mean dCost | Wilcoxon p (H1: dCost < 0) | Conclusion |
|---|---:|---:|---|
| Naive vs trim | −$0.18 | **0.0180** | Naive significantly cheaper |
| Naive vs specialist | $0.00 | 0.3375 | No cost difference |

## Decision-tree mapping

The plan's decision tree maps the (naive-vs-specialist, naive-vs-trim) outcome
pair to a remediation strategy. Our cell:

| Naive vs specialist | Naive vs trim | Plan's conclusion | Plan's next step |
|---|---|---|---|
| **naive ≈ specialist (no signal)** | **naive < trim** | Picker bad + trim helps | Build oracle picker; rerun |

This row's named conclusion is *Picker bad + trim helps*, but the picker-bad
inference is conditional on trim being a clean control. **Caveat #1 in [PR #255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255)**
flagged the trim baseline as knowledge-leak-contaminated: trim agents are
descendants of `agent-916a`, the orchestrator that originally worked these
13 issues. They've literally seen these issues before. The naive arm is the
clean control; its 17-point loss to trim is consistent with "trim has issue-
specific exposure naive lacks."

If the trim arm is contaminated as caveat #1 suggests, the right reading is:

> **Neither the picker nor the per-agent content moves the needle on this
> corpus.** What moves the needle is direct prior exposure to the issues
> being measured.

Under that reading, building an oracle picker would not close the gap — even
perfect routing among existing specialists would still score at the naive
level. The 17-point delta is not a picker-quality signal; it is a measurement
artifact of using a non-naive baseline.

## Per-issue paired tables

### Naive vs trim baseline (sorted by dQ, ascending)

| Issue | naive Q | trim Q | **dQ** | naive $ | trim $ | dCost |
|---:|---:|---:|---:|---:|---:|---:|
| 178 | 25.9 | 64.2 | **−38.3** | $1.35 | $1.83 | −$0.48 |
| 172 | 17.9 | 54.4 | **−36.5** | $1.40 | $2.00 | −$0.61 |
| 185 | 21.5 | 56.7 | **−35.2** | $2.06 | $2.00 | +$0.05 |
| 565 | 34.3 | 67.2 | **−32.8** | $0.35 | $0.26 | +$0.10 |
| 574 | 32.0 | 62.2 | **−30.2** | $0.63 | $1.18 | −$0.56 |
| 180 | 12.7 | 41.6 | **−28.9** | $1.90 | $1.96 | −$0.06 |
| 186 | 14.0 | 42.1 | **−28.1** | $1.21 | $1.09 | +$0.12 |
| 665 | 81.3 | 81.4 | −0.1 | $0.15 | $0.15 | $0.00 |
| 156 | 86.0 | 85.6 | +0.4 | $0.11 | $0.20 | −$0.09 |
| 157 | 92.3 | 92.0 | +0.4 | $0.40 | $0.52 | −$0.13 |
| 168 | 51.0 | 49.9 | +1.1 | $0.47 | $0.71 | −$0.23 |
| 649 | 50.2 | 48.2 | +2.0 | $1.54 | $1.91 | −$0.37 |
| 162 | 86.7 | 83.3 | +3.4 | $0.11 | $0.21 | −$0.11 |

Same two-cluster shape as [PR #255](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255): 6 pushback-class / launch-breadcrumb /
gate issues are at parity with trim (dQ ∈ [−0.1, +3.4]); 7 implement-class
issues with non-trivial diff surfaces lose to trim by 28+ points.

### Naive vs specialist-redo (sorted by dQ, ascending)

| Issue | naive Q | specialist Q | dQ | naive $ | specialist $ | dCost |
|---:|---:|---:|---:|---:|---:|---:|
| 186 | 14.0 | 27.7 | **−13.7** | $1.21 | $0.71 | +$0.50 |
| 180 | 12.7 | 14.0 | −1.3 | $1.90 | $1.94 | −$0.05 |
| 665 | 81.3 | 82.7 | −1.3 | $0.15 | $0.13 | +$0.02 |
| 178 | 25.9 | 26.7 | −0.8 | $1.35 | $1.65 | −$0.30 |
| 172 | 17.9 | 17.7 | +0.2 | $1.40 | $1.11 | +$0.28 |
| 157 | 92.3 | 91.7 | +0.7 | $0.40 | $0.35 | +$0.05 |
| 168 | 51.0 | 49.7 | +1.3 | $0.47 | $0.62 | −$0.14 |
| 649 | 50.2 | 48.6 | +1.6 | $1.54 | $1.99 | −$0.45 |
| 574 | 32.0 | 30.3 | +1.7 | $0.63 | $0.71 | −$0.08 |
| 156 | 86.0 | 83.3 | +2.7 | $0.11 | $0.13 | −$0.03 |
| 162 | 86.7 | 83.3 | +3.3 | $0.11 | $0.19 | −$0.08 |
| 185 | 21.5 | 17.3 | +4.2 | $2.06 | $1.47 | +$0.59 |
| 565 | 34.3 | 27.7 | +6.7 | $0.35 | $0.43 | −$0.08 |

Range −13.7 to +6.7. Median dQ ≈ +0.7. Naive scored slightly higher on 9 of 13
issues. The −13.7 outlier on #186 (Calldata Decode in the specialist arm) is
the only large-magnitude cell; without it, naive vs specialist tightens to
mean dQ ≈ +1.4, still no signal.

## Three-arm matrix

|              | trim | specialist | naive |
|---|---:|---:|---:|
| trim         | —    | +17.5 | +17.1 |
| specialist   | −17.5 | — | −0.077 (n.s.) |
| naive        | −17.1 | +0.077 (n.s.) | — |

Reads: cell `(row, col)` is `mean(row.Q) − mean(col.Q)`. Trim dominates both
other arms by ~17 points; specialist and naive are within noise of each
other.

## Tooling state — 2 issues hit during the run

- **[#266 (this PR)](https://github.com/szhygulin/vaultpilot-dev-framework/pull/266)** — `dispatch-specialist-redo-parallel.sh` did not pass
  `--no-registry-mutation`. After cell 1, the naive agent's tags drifted from
  `["general"]` to four tags (`general`, `idl-drift`, `marginfi`,
  `tracking-issue`). Plan flagged this as risk #1 with snapshot+restore as
  the recommended mitigation; the flag closes the gap at the source. Caught
  by mid-run inspection of the first naive-baseline cells. 9 pre-fix cells
  kept (CLAUDE.md untouched, no shared-lessons dirs on this machine — no
  prompt-content impact); 30 post-fix cells ran with the flag.
- **[#264](https://github.com/szhygulin/vaultpilot-dev-framework/issues/264) recurrence** — `node_modules/` got emptied mid-run; 5 leg-2 cells
  failed with `ERR_MODULE_NOT_FOUND`. Reinstalled (`npm ci`) and retried.
  Issue still open.

A 6th cell (bench-r2-agent-8274-186) was killed twice mid-run (worktree
collisions on the scratch clone after prior interrupted runs left stale
branches and uncleaned worktrees). Cleaned all four scratch clones, third
attempt succeeded ($0.90).

## Caveats

1. **The trim baseline is not a clean control.** [PR #255 caveat #1](https://github.com/szhygulin/vaultpilot-dev-framework/pull/255) named
   this; the naive arm's 17-point loss to trim makes the contamination
   concrete. Any decision-tree row whose conclusion routes on "naive < trim"
   should be read with this caveat in mind. The 17-point delta is best
   modeled as the value of issue-specific prior exposure, not as picker
   quality or content quality.

2. **n=13 paired Wilcoxon at this effect size is near-detection.** Naive vs
   specialist p=0.0921 is not significant at α=0.05 but is also not the
   p≈0.5 you'd expect under exact equivalence. A larger corpus (or replicate
   K up from 3) might separate +0.7 mean dQ from zero. The plan deferred
   "larger corpus" as a separate scoping decision.

3. **Naive agent's per-agent CLAUDE.md mtime verified untouched.** Risk #4
   in the plan: confirm `--skip-summary` worked across all 39 cells. mtime
   stayed at the 1179-byte mint state for the full run; registry tags also
   stayed at `["general"]` after PR #266 took effect.

4. **#186 outlier in naive-vs-specialist.** Calldata Decode (the specialist
   arm's pick) scored 27.7 on issue #186 vs naive's 14.0. Removing this one
   cell drops the naive-vs-specialist effect from "near zero" to "mild
   naive advantage" but doesn't change the qualitative conclusion. Worth a
   look at #186's prompt context for what Calldata Decode brought that
   moved the score (likely calldata-shape lessons relevant to message-
   parsing patterns in #186's PR).

5. **The naive arm's GENERIC_SEED is not strictly empty.** Risk #2 in the
   plan: the seed includes general guidance that may already over-specify
   behavior. The 1179-byte seed is conservative (PR-workflow + code
   discipline + tool-usage rules) and was verified at start. A "truly empty
   seed" arm would be a separate experiment but is unlikely to differ from
   naive given how thin the seed already is.

## Phase B (oracle picker) decision

Plan §"Phase B": fires only if Phase A is inconclusive on the picker
question AND `naive ≈ specialist, naive < trim`. Both conditions hold.

**Recommendation: do not fire Phase B.** Per the caveat-aware reading above,
even a perfect oracle picker among existing specialists would not close the
17-point gap, because the gap is caveat-#1 contamination, not picker
quality. Phase B costs ~$40 + ~$10 judge for a likely-null result.

A more useful follow-up — which the plan called out as out-of-scope here but
worth considering separately — is a **clean-baseline arm**: freshly-mint K
specialists, give them N issues each in unrelated topical territory, then
dispatch them against the 13-issue corpus. If those score like naive (~17
below trim), caveat #1 is confirmed empirically and the 17-point gap
becomes "issue-specific exposure premium" rather than "picker debt."
That's a Phase B' design, not Phase B as specified.

## Files

- [`naive-vs-trim.json`](../curve-redo-data/naive-baseline/naive-vs-trim.json)
  (gitignored at runtime) — raw paired-Wilcoxon output for naive-vs-trim.
- [`naive-vs-specialist.json`](../curve-redo-data/naive-baseline/naive-vs-specialist.json)
  (gitignored) — raw output for naive-vs-specialist.
- [`picks.tsv`](../curve-redo-data/naive-baseline/picks.tsv) — 13 rows, all mapping to
  `agent-8274`, rationale `fresh-general`.
- [`logs-leg{1,2}/`](../curve-redo-data/naive-baseline/) (gitignored) — 18 + 21 cell logs.
- [`scores-leg{1,2}/`](../curve-redo-data/naive-baseline/) (gitignored) — 39 judge.json + 29 tests.json.
- [`mint-naive-agent.cjs`](specialist-redo/mint-naive-agent.cjs) — minted the
  naive agent + wrote GENERIC_SEED to its CLAUDE.md.
- [`combine-bench-pair.cjs`](specialist-redo/combine-bench-pair.cjs) — bench-vs-bench
  pairwise combiner (sister to the existing curveStudy-baseline combiner).
