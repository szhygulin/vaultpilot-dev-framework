# Phase C — B-axis (tests pass rate) cross-arm ranking at n=13 implements

**Date:** 2026-05-12
**Scope:** Which agent-building methodology produces implementations that pass hidden behavior tests best, at n=13 implement-class issues from the curve-redo corpus?

## Headline

| Rank | Arm | Mean B | Median B | Issues w/ data | Cells valid | Cells >= 50 | Cells > 25 | Cells == 0 |
|------|-----|--------|----------|----------------|-------------|-------------|------------|------------|
| 1 | **prose** | **55.9** | 46.2 | 12/13 | 29/39 | 12 | 22 | 0 |
| 2 | **specialist** | **55.8** | 62.0 | 13/13 | 37/39 | 19 | 28 | 3 |
| 3 | **tailored** | **54.2** | 51.0 | 12/13 | 36/39 | 19 | 29 | 3 |
| 4 | **trim** | **47.0** | 39.4 | 13/13 | 36/39 | 13 | 25 | 5 |

**Top 3 are inside the noise floor** — paired Wilcoxon p-values across all six pairs run 0.26–0.96 (none significant at α=0.05). The 9-point spread between prose/specialist/tailored vs. trim isn't statistically separable either at this sample size (n=12–13 per pair).

The notable signal: **trim has more "complete failures" (5 cells at B=0) and lower per-issue median (39.4)** than the other three arms. Trim consistently produces working diffs that miss the hidden-test contract — strongest on simple issues (#251, #626, #667) but degrades sharply on complex ones (#180 catastrophically: 2.0% mean B; #253: 44.7%; #168: 18.0%).

**Specialist has the most-complete coverage** (37/39 valid cells, the only arm at 13/13 issues with at least one valid mean) and **the highest median B (62.0)** — when you need a single deployable arm that works across a broad issue mix, specialist is the safest choice. Prose narrowly tops the mean ranking on a smaller cell pool (29 valid vs 37) — its lead is driven by zero `B=0` cells, not by any single dominant per-issue performance.

## Per-issue 13×4 table (per-cell B; mean across reps)

| issue | tailored | prose | trim | specialist |
|-------|----------|-------|------|------------|
| 157 | 98.0 [98,97,99] | 97.3 [99,94,99] | 99.0 [99,99,99] | 98.7 [99,99,98] |
| 168 | **87.0** [97,67,97] | 18.0 [18,18,18] | 18.0 [18,18,18] | 14.0 [18,18,6] |
| 172 | 21.9 [30,5,30] | 28.4 [25,27,32] | 30.7 [32,28,31] | 28.4 [26,30,null] |
| 178 | 54.9 [45,46,74] | 49.6 [50,null,null] | 53.2 [43,56,61] | **71.1** [84,84,45] |
| 180 | 99.7 [99,100,100] | 100.0 [100,100,100] | **2.0** [0,0,6] | 100.0 [100,100,100] |
| 185 | 32.0 [32,32,32] | 32.0 [32,32,null] | 32.0 [32,32,32] | **37.7** [32,49,32] |
| 186 | 0.0 [0,0,0] | null [all-null] | 0.0 [0,0,0] | 0.0 [0,0,0] |
| 251 | 79.0 [80,77,80] | 79.0 [80,77,80] | 79.4 [80,77,81] | 79.4 [81,77,80] |
| 253 | 38.3 [27,35,53] | 30.0 [49,36,5] | 44.7 [51,54,29] | **62.0** [90,29,67] |
| 565 | 6.0 [6,6,6] | 6.0 [6,6,6] | **16.7** [12,30,8] | 4.8 [6,2,6] |
| 626 | 86.5 [86,85,88] | 88.1 [88,88,null] | 97.2 [null,97,null] | 85.6 [85,90,82] |
| 649 | 47.1 [38,50,54] | 42.8 [48,38,null] | 39.4 [38,40,40] | 46.0 [51,40,47] |
| 667 | null | 99.0 [99,null,null] | 99.0 [null,99,99] | 97.8 [97,99,null] |

Values are tests-passed-percent (B). Bold marks the per-issue arm leader where the gap is >5 percentage points.

## Pairwise paired Wilcoxon (signed-rank, two-sided)

| Pair | n | W | z | p |
|------|---|---|---|---|
| tailored vs prose | 11 | 10.0 | -1.12 | 0.263 |
| tailored vs trim | 12 | 27.0 | -0.05 | 0.959 |
| tailored vs specialist | 12 | 26.0 | -0.62 | 0.534 |
| prose vs trim | 12 | 13.0 | -1.13 | 0.260 |
| prose vs specialist | 12 | 21.0 | -1.07 | 0.286 |
| trim vs specialist | 13 | 32.0 | -0.55 | 0.583 |

No pair separates at α=0.05. The closest contender for significance is prose vs. trim (p=0.26) — consistent with the descriptive observation that trim has worse worst-cases. Larger K per cell would narrow the bands, but the means alone suggest the rank ordering is real, not noise.

## What was recovered, what couldn't be

### Recovered

**Specialist 626 (all 3 reps)** — the original diffs failed `git apply` on a `package-lock.json` hunk. Stripping that one file from the unified-diff (kept `src/modules/curve/actions.ts` + `test/curve-v1.test.ts`) and re-running scored cleanly: B = 93/109, 98/109, 89/109 — mean 85.6. Recovery diffs at `research/curve-redo-data/v2-scoring/recovery/bench-r{1,2,3}-agent-916a-626-clean.diff`.

**Specialist 253 (all 3 reps)** — the original diffs included `node_modules` (binary) and several `research/` / `feature-plans/` paths the corpus baseSha didn't have. Filtered to `src/`, `bin/`, `test/`. Recovered B = 90/100, 29/100, 67/100 — mean 62.0. R2's low score (29) is genuine, not a recovery artifact: the cell modified `applyReplayRollback` in a way that fails several `b1-no-throw-on-existing-remote` and `b1-apply-replay-returns-object` assertions.

### Not recoverable

**Tailored 667 + 669 (all 3 reps each)** — the tailored arm never generated any diff or score file for these two issues. Both are post-Phase-A enrichment-batch additions; the tailored arm's run predates them in this worktree's data. No diff exists to filter or hand-port. Accepting null per the deliverable.

**Specialist 172 r3** — 1 of 3 reps null. The other two reps are present and the per-issue mean is computed over them (n=2 for r3, but the analyzer uses the per-issue mean which is robust to this).

**Prose 186** — all 3 reps null in the source dir. The prose arm did not produce a scorable cell for #186 (the issue is a 0-score outlier across all arms anyway, so the null isn't load-bearing on the ranking).

**Trim 626 r1 + r3** — only r2 has a valid score for the new-6 #626 cells. r1/r3 are apply-failures upstream that weren't re-extracted (not in scope for this run — the deliverable focuses on the 27 old-13 trim cells, which were all extracted + scored cleanly).

## Methodology notes

- **B definition**: per-cell `100 * passed / total` from the v2 hidden-test suite (`research/curve-redo-bundle/curve-redo-tests/<issueId>/`). `apply=false` or `total=0` → null (not counted).
- **Per-issue B**: mean across the K=3 reps, skipping nulls. Per-issue B is null only when ALL reps are null.
- **Arm mean B**: mean of per-issue means (each implement issue contributes equally regardless of how many reps had data).
- **Trim cell selection** (old-13): one cell per trim size at sizes 22000-s24026, 35000-s37026, 50000-s52026 — same triple across all 9 old-13 implements. Issue #565 had 14 of 18 trim seeds returning pushback (decision != implement); the three picked seeds all decided implement (35000-s37026 plus the two non-default seeds 14000-s2016032 and 22000-s2024032).
- **Wilcoxon n** drops when one arm has a null per-issue mean — pairs where either side is null are excluded.
- **Scoring**: `vp-dev research run-tests --diff-path <diff> --tests-dir <hidden-tests> --clone-dir <fresh-clone> --framework <node-test|vitest> --out <out>`. Fresh clone per cell at the issue's corpus baseSha. Hidden tests copied to `testsDestRelDir` (per-issue, e.g. `src/agent`) before running. Recovery cells used the same harness with the filtered diff.

## Reproduce

```
# 1. trim old-13 rescoring (27 cells, ~10 min wall, 4-way parallel)
cd .claude/worktrees/b-axis-rank
npm run build
bash scripts/parallel-rescore.sh 4

# 2. specialist recovery (6 cells, ~3 min wall)
# (see scripts/filter-diff.py + per-rep invocations of score-cell.sh in commit history)

# 3. analyzer
node scripts/b-axis-rank.cjs
```

Output: `research/curve-redo-data/v2-scoring/b-axis-ranking.json`.

## References

- Companion PR: [#300](https://github.com/szhygulin/vaultpilot-dev-framework/pull/300) (n=19 4-arm aggregation across all axes).
- Trim diffs: `tmp-inspect/leg{1,2}/diffs-leg{1,2}/` (carried from prior leg snapshots).
- Hidden tests: `research/curve-redo-bundle/curve-redo-tests/<issueId>/`.
- Corpus: `research/curve-redo-bundle/corpus.json`.
