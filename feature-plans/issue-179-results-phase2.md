# Issue #179 — Phase 2 results (28-cell sequential re-dispatch, 2026-05-06)

Resumed after the phase-1 worktree-race wipe. 28 cells dispatched against `vaultpilot-mcp-smoke-test` (issues #50, #52, #54) using the 4-way parallel + per-dev-agent serialization design that addresses phase-1's failure mode.

## Run summary

- 28 cells in 5119 s wall (85.3 min) — **exact match to forecast**.
- Total cost: **$143.23** (under the $180 forecast; $5.12 mean per cell).
- Zero worktree-race errors. Per-clone isolation worked as designed.
- Every cell returned `decision=implement` (rc=0).

| Dev-agent | CLAUDE.md size | n cells | Total cost | Mean cost / impl |
|---|---:|---:|---:|---:|
| agent-9180 | 6,140 B | 2 | $9.31 | $4.66 |
| agent-9181 | 10,255 B | 2 | $11.14 | $5.57 |
| agent-9182 | 14,300 B | 3 | $12.91 | $4.30 |
| agent-9183 | 18,085 B | 3 | $14.95 | $4.98 |
| agent-9184 | 22,026 B | 3 | $13.02 | $4.34 |
| agent-9185 | 28,911 B | 3 | $13.18 | $4.39 |
| agent-9186 | 35,047 B | 3 | $16.59 | $5.53 |
| agent-9187 | 43,091 B | 3 | $17.64 | $5.88 |
| agent-9188 | 50,801 B | 3 | $17.07 | $5.69 |
| agent-9189 | 58,654 B | 3 | $17.43 | $5.81 |

agent-9180 and agent-9181 ran 2 cells each (issue #50 was skipped for them — the phase-1 wipe killed those mid-flight and the re-dispatch script preserved that skip).

## Headline finding: outcome quality is uniform, cost is the only signal

**Every agent at every size produced `decision=implement` on every issue.** This drives the quality composite to 0.75 across all 10 sizes (the formula returns 0.75 when implement_rate=1, pushback_rate=0, error_max_turns=0, and no operator rubrics are supplied).

Consequence: the regression on `factor = qualityMax / quality` is degenerate (all factors = 1.0 → zero variance in y → R²=NaN → no curve to fit).

The **cost** signal is the only differentiator we have from this run. Re-deriving samples with `factor = meanCost / minMeanCost`:

| Size (B) | Mean cost | Factor | |
|---:|---:|---:|---|
| 6,140 | $4.66 | 1.082 | smallest agent — modestly above the floor |
| 10,255 | $5.57 | 1.294 | |
| 14,300 | $4.30 | **1.000** | global min |
| 18,085 | $4.98 | 1.158 | |
| 22,026 | $4.34 | 1.009 | |
| 28,911 | $4.39 | 1.021 | |
| 35,047 | $5.53 | 1.285 | inflection — cost rises from here |
| 43,091 | $5.88 | 1.366 | |
| 50,801 | $5.69 | 1.322 | |
| 58,654 | $5.81 | 1.350 | largest agent |

### Cost-based quadratic regression

```
degree=2, n=10
R² = 0.472, adj-R² = 0.321
F(2, 7) = 3.13, p = 0.107
  c0 (intercept):     est=1.150   SE=0.061   t=19.0    p=2.8e-7   ***
  c1 (linear):        est=0.078   SE=0.043   t=1.81    p=0.114
  c2 (quadratic):     est=0.039   SE=0.046   t=0.83    p=0.431
```

**The fit is not statistically significant at α=0.05** — the F-test p-value is 0.107. The quadratic term carries no signal (p=0.43), the linear term is borderline (p=0.114). Only the intercept is significantly nonzero.

Visually the data shape isn't a clean quadratic: floor near 14KB, rise above 35KB. A piecewise model (or a sigmoid pinned at the inflection) would fit better but adds unjustified parameters at this sample count.

## Why quality didn't move

Three plausible explanations, in order of likelihood:

1. **The 3-issue smoke-test set is too easy.** Issues #50 (cross-batch dedup), #52 (stop filing advisory-prose-only findings), #54 (preflight-confirmed content-hash binding) are routine implementation work with established patterns. Even a 6KB-trimmed agent has enough scaffolding to ship correct code. To measure degradation, the issue set needs at least some cells where the small-CLAUDE.md agent fails or pushes-back-incorrectly while the large one succeeds.
2. **The `--dry-run` gate elides the steps where larger CLAUDE.md would matter.** Dry-run intercepts push, PR-create, and comment side effects. A real run would expose code-review-feedback loops, CI failures, and merge conflicts where deeper context (more rules, more incident references) might pay off. We're measuring "decide what to do," not "do it well."
3. **The curve really is flat at this specialty + model.** `claude-opus-4-7[1m]` may have so much native capability that 6KB vs 58KB of project-specific rules makes no difference for advisory-class work. If true, the curve should encode `factor=1` for all sizes — a useful negative result.

(1) is fixable by adding 2-3 known-hard issues (a known phased-split issue, a known rogue-MCP issue, a known dependency-tracker that requires a specific pushback shape). (2) is fixable by `--no-dry-run` runs at additional cost and risk. (3) needs more diverse specialty/issue evidence.

## What to ship

The placeholder samples currently in `src/util/contextCostCurve.ts` (from #177's body — not measured) should not be replaced from this run. Two options:

- **Hold the placeholder** until a follow-up study with harder issues + operator rubrics produces a statistically-significant curve. Phase 3's consumer code can land with a `// TODO(#179): replace with measured curve` comment.
- **Replace with the cost-based curve as a provisional measurement**, with explicit caveats: "this curve measures cost-per-issue, not accuracy degradation; it is not statistically significant at α=0.05 (F(2,7) p=0.107); use with skepticism." `--mode update` against the placeholders is a third path that splits the difference, but mixing pre-study guesses with post-study weak measurements doesn't help.

Recommended: hold the placeholder. File a follow-up issue: "Curve study v2 — harder issue set + operator rubrics." Phase 3 lands with the placeholder + TODO.

## What this validates

- **The 4-way parallel + per-dev-agent mutex design works.** 28 cells, zero worktree errors. Phase 1's 41 spawn-stub failures are gone.
- **The shipped tool (`vp-dev research curve-study`) produces the right artifacts.** Aggregation extracted all 28 envelopes; scoring + regression + significance ran cleanly on the full pipeline; the proposal JSON has the data structure we need for hand-merging.
- **The regression diagnostics work.** R²=NaN on degenerate data is surfaced cleanly (no exceptions). On the cost-based fit, the F-test p-value (0.107) correctly flags the curve as not-significant — which is the primary safety check the significance work was added for.

## Artifacts

- `research/issue-179-data/cells.json` — 76 cells total (15 vp-mcp pilot + 28 phase-2 + the older incidentals).
- `research/issue-179-data/curve-proposal-2026-05-06.json` — quality-based proposal (degenerate; for record).
- `research/issue-179-data/curve-proposal-cost-based-2026-05-06.json` — cost-based proposal (provisional).
- `research/issue-179-data/logs/smoke-10size-phase2/` — 28 envelope-complete cell logs + dispatch orchestration log.
