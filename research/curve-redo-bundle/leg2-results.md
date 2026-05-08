# Curve-redo leg 2 — results

Run date: 2026-05-07. Coding cells: Sonnet 4.6. Reasoning judge: Opus 4.7 (K=3 medians).
Target repo: `szhygulin/vaultpilot-dev-framework` (node-test). Issues: 7 leg-2 ids × 18 trims = 126 cells.

Tarball: [`research/curve-redo-bundle/leg2-results.tar.gz`](leg2-results.tar.gz) (839 KB,
gitignored at runtime under `research/curve-redo-data/`). Bundle layout per
[`README.md`](README.md). Reproducer scripts in `research/curve-redo-data/`.

## Headline

| Metric | Value |
|---|---|
| Cells dispatched | 126 |
| Decisions | 125 implement / 0 pushback / 1 error |
| Diffs apply cleanly | 126 / 126 |
| Total cost | $182.67 dispatch + $36.72 judge ≈ **$220** |
| Cell-duration p50 / p95 / max | 475 s / 752 s / 1011 s |

The 1 error cell (`agent-916a-trim-14000-s16026-172`) hit an envelope JSON
parse failure (`Bad escaped character at position 542`) after 786 s and
$2.42 — the agent emitted a malformed envelope. Diff captured cleanly, but
no envelope means no judge ran; the quality formula maps the cell to 0.

## Per-trim quality

`Q = A + B` for implement cells (A ∈ 0..50 judge median, B ∈ 0..50 normalized
hidden-test pass rate), `Q = 2A` for pushback, `Q = 0` for error. Bucketed
into nominal sizes (each contains 3 seed-replicates × 7 issues = 21 cells):

| Trim (chars) | n | implement | mean A | mean B | **mean Q** |
|---:|---:|---:|---:|---:|---:|
|  6 000 | 21 | 21 | 41.0 | 16.2 | **57.2** |
| 14 000 | 21 | 20 | 41.4 | 16.0 | 54.7 |
| 22 000 | 21 | 21 | 41.1 | 15.9 | 57.1 |
| 35 000 | 21 | 21 | 41.2 | 14.9 | 56.1 |
| 50 000 | 21 | 21 | 41.0 | 16.8 | 57.7 |
| 58 000 | 21 | 21 | 41.2 | 17.1 | **58.3** |

Per-trim mean Q sits within a 3.6-point band (54.7 → 58.3). Mean A is
remarkably flat at 41 ± 0.4 across all six sizes — the reasoning judge
sees no quality difference attributable to CLAUDE.md size on these
implement-class issues. Mean B drifts upward slightly with size (16.2 →
17.1) but the variance per size is large enough that the trend isn't
significant at n=21 per bucket. As with leg 1, curve fit is deferred to
the combiner over both legs.

The 14 000 dip (54.7) is driven by a single 14k cell that scored 0
(the parse-error cell on issue 172, agent-916a-trim-14000-s16026); without
that cell the bucket mean recovers to 57.5.

## Per-issue quality

| Issue | Implement / 18 | mean Q | total | Note |
|---:|---:|---:|---:|---|
| 157 | 18 | 92.0 | 100 | unanimously implemented; high A and high B (most agents fully solved) |
| 168 | 18 | 49.9 | 100 | unanimous implement; B bottleneck — agents added the CLI flag but missed the `resolveMinClusterSize` / `PAIR_CLUSTER_FLOOR` exports the hidden tests check |
| 172 | 17 | 51.4 | 102 | 1 envelope parse failure; otherwise mid-range Q |
| 178 | 18 | 64.2 | 102–119 | per-cell `total` varies 102–119 (some hidden test files contain >1 `test()` call) |
| 180 | 18 | 41.6 | 100 | lowest mean Q — implement decisions but agents' diffs frequently miss the named exports the tests target |
| 185 | 18 | 56.7 | 100 | mid-range; pre-dispatch dependency-check feature |
| 186 | 18 | 42.1 | 102 | low mean Q — reasonable A but B drags the mean |

All seven leg-2 issues had decisionClass `implement` (closed PRs, ground-truth
fix exists). No leg-2 cell pushed back across all 126. Compared with leg 1's
mix of pure-pushback (#156, #162, #665) and unanimous-implement (#649) issues,
leg 2 gives a homogeneous implement-only signal — the curve over both legs
gets balanced coverage of both decision modes.

## Tooling state

Two harness bugs surfaced during the leg-2 smoke and were fixed before the
production run:

- [#227](https://github.com/szhygulin/vaultpilot-dev-framework/pull/227) — `applyReplayRollback` strips the `origin` remote so larger trim CLAUDE.mds carrying a "sync to main before work" rule can't run `git rebase origin/main` and undo the rollback. Smoke evidence: a 58 KB-trim cell's captured diff dropped from 1433 files (rebase-contaminated) to 2 files (agent's actual edits) on the same issue.
- [#229](https://github.com/szhygulin/vaultpilot-dev-framework/pull/229) — `runHiddenTests` runs `npm ci` in cell clones (skipped when `node_modules` exists or `package.json` is absent) so hidden tests that import from the source tree can resolve project deps. Smoke evidence: B-score went from 0/100 (every test `ERR_MODULE_NOT_FOUND` on `zod`) to real signal (18/100 on the smoke cell).

Operational caveat (not a code fix): #227's blanket `git remote remove origin`
also breaks the orchestrator's createWorktree step on subsequent cells reusing
the same per-agent clone (createWorktree needs `git fetch origin main`). The
leg-2 dispatch wrapper (`research/curve-redo-data/dispatch-leg2.sh` and
`redispatch-leg2.sh`) compensates by running `git remote add origin <SRC>`
idempotently before each `vp-dev spawn`. The first dispatch attempt skipped
this step, lost 110 of 126 cells to `fatal: 'origin' does not appear to be a
git repository`, and was redispatched with the per-issue wait barrier so no
two cells share a clone concurrently. Total ~$210 of dispatch time was spent
across both runs (vs ~$140 expected) — the deltas are ~$20 wasted re-running
the 110 cells.

## Caveat: B-score denominator

Per-cell hidden-test `total` ranges 100–119:

| Issue | total |
|---:|---:|
| 157 | 100 |
| 168 | 100 |
| 172 | 102 |
| 178 | 102–119 |
| 180 | 100 |
| 185 | 100 |
| 186 | 102 |

The variance is from individual hidden-test files containing multiple
`test()` invocations (more sub-tests than file-level entries). The Q
formula in `cellScores.ts` normalizes B = `(passed / total) × 50`, so
absolute B is comparable across cells on the same issue but slightly
inflated relative to a denominator-of-100 expectation. Same caveat as
leg 1's note about vitest's summary counting only non-erroring files.

## Next steps

- `combine-legs.cjs` aggregates leg 1 (108 cells, vp-mcp) + leg 2 (126
  cells, vp-dev-agents) → 234 cells across 13 issues, fits the linear-log
  default per the curve-study regression methodology in `CLAUDE.md`.
- Hand-merge into `src/util/contextCostCurve.ts` only if the accuracy fit
  clears p < 0.05 (per Step 7 in `README.md`). Leg 2 alone shows no
  monotonic effect of CLAUDE.md size on Q (54.7–58.3 across six sizes),
  but the combined dataset has more decision-mode variation and is the
  appropriate stage for the call.
