# Curve-redo leg 1 — results

Run date: 2026-05-07. Coding cells: Sonnet 4.6. Reasoning judge: Opus 4.7 (K=3 medians).
Target repo: `szhygulin/vaultpilot-mcp` (vitest). Issues: 6 leg-1 ids × 18 trims = 108 cells.

Tarball: [`research/curve-redo-bundle/leg1-results.tar.gz`](leg1-results.tar.gz) (275 KB,
gitignored at runtime under `research/curve-redo-data/`). Bundle layout per
[`README.md`](README.md). Reproducer scripts in `research/curve-redo-data/`.

## Headline

| Metric | Value |
|---|---|
| Cells dispatched | 108 (105 + 3 smoke) |
| Decisions | 35 implement / 72 pushback / 1 error |
| Non-empty diffs | 36 (33% — close to the implement count) |
| Total cost | $75.33 dispatch + ~$13 judge ≈ **$88** |
| Cell-duration p50 / p95 / max | 139 s / 594 s / 692 s |

The 1 error cell (`agent-916a-trim-14000-s1016029-574`) hit a schema-validation
failure: `envelope.scopeNotes` was `null` where the parser expected a string.
Diff still captured (6.6 KB), but no envelope means no reasoning judge could
run. Worth a follow-up against the envelope schema or the agent prompt that
emits it; quality formula maps to `0` for parse-failed cells, so the cell is
informative but lossy.

## Per-trim quality

`Q = A + B` for implement cells, `Q = 2A` for pushback cells, `Q = 0` for
error/parse-fail. Range 0..100. Mean across 18 cells per trim size:

| Trim (chars) | Implement / 18 | mean A (judge) | mean B (tests) | **mean Q** |
|---:|---:|---:|---:|---:|
|  6 000 |  6 | 38.8 | 12.8 | **72.6** |
| 14 000 |  6 | 38.5 | 13.2 | 68.0 |
| 22 000 |  7 | 37.7 | 12.1 | 68.7 |
| 35 000 |  9 | 34.3 | 14.0 | 63.6 |
| 50 000 |  3 | 39.0 | 11.9 | **76.7** |
| 58 000 |  4 | 38.3 | 12.0 | 74.8 |

No monotonic decline yet — the dip at 35 000 and the peak at 50 000 sit within
expected sampling noise for n=18 per cell. Curve fit deferred to leg-2 +
combiner (Step 6 in [`README.md`](README.md)); leg 1 alone has too few points
across the trim axis to call shape.

## Per-issue quality

| Issue | Implement / 18 | mean Q | Note |
|---:|---:|---:|---|
| 156 | 0 | 85.6 | tracking-only, high-A pushback consensus |
| 162 | 1 | 83.3 | tracking-only, high-A pushback consensus |
| 565 | 4 | 67.2 | mixed |
| 574 | 12 | 58.7 | mixed (multi-RPC ENS consensus implementation) |
| 649 | 18 | 48.2 | unanimous implement; widest Q range |
| 665 | 0 | 81.4 | tracking-only, high-A pushback consensus |

Pure-pushback issues (156/162/665) cluster Q ≈ 81-86 — judges reward concise
"action: none required" reasoning consistently regardless of trim size. Mixed
and unanimous-implement issues (565/574/649) drag mean Q down because B
(hidden-test pass rate) caps at 14 / 50 even on high-implement-count issues.

## Tooling state

Three latent score-loop bugs surfaced during the leg-1 run, all fixed before
final results:

- [#223](https://github.com/szhygulin/vaultpilot-development-agents/pull/223) — `captureWorktreeDiff` honors `baseSha` so committed agent work isn't dropped.
- [#224](https://github.com/szhygulin/vaultpilot-development-agents/pull/224) — `runIssueCore` defaults `baseSha` to pre-agent worktree HEAD when caller omits `--replay-base-sha` (open-issue cells).
- [#228](https://github.com/szhygulin/vaultpilot-development-agents/pull/228) — `testRunner` resolves relative `--diff-path` against process cwd, writes a vitest `--config` override so `include` doesn't filter hidden tests, plus README Step 2.5 (one-time `npm ci` per source clone) and Step 4 `node_modules` symlink.
- [#229](https://github.com/szhygulin/vaultpilot-development-agents/pull/229) — `testRunner` runs `npm ci` automatically when `package.json` is present and `node_modules` is missing (safety net for the symlink path in #228).

Without #224 + #228 the leg would have produced 0 non-empty diffs — same
failure mode as the 2026-05-07 morning run that consumed $25 and zero PR-grade
output before being killed.

## Caveat: B-score denominator

vitest's `Tests` summary line counts only tests that ran in non-erroring
files. When a hidden-test file fails at import / compile time, it contributes
0 to `passed` AND 0 to the denominator — `total` reflects executed tests, not
attempted files. Per-cell `total` ranges 50-104 across the 6 issues:

| Issue | total |
|---:|---:|
| 156 | 103 |
| 162 | 100 |
| 565 |  50 |
| 574 |  75 |
| 649 | 104 |
| 665 | 100 |

B values are comparable across agents on the same issue (same denominator) so
the curve fit isn't biased, but absolute B is slightly inflated relative to a
denominator-of-100 expectation. Flagged for a follow-up that counts file-level
errors as `errored` against the full Test Files count.

## Next steps

- Leg 2 dispatch on `szhygulin/vaultpilot-development-agents` (node-test, 7
  issues × 18 trims = 126 cells, ~$140 + ~$60 judge).
- `combine-legs.cjs` aggregates both legs and runs the linear-log default fit
  per the curve-study regression methodology in `CLAUDE.md`.
- Hand-merge into `src/util/contextCostCurve.ts` only if the accuracy fit
  clears p < 0.05 (per Step 7).
