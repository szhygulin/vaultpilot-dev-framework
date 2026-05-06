# Issue #179 — Pilot results

15 dispatches across 3 study agents (16/32/48 KB CLAUDE.md trims of agent-916a) × 5 vaultpilot-mcp open issues, all `--dry-run --skip-summary`, run 2026-05-06.

## Summary

| Agent (size) | implement | pushback | error | total cost | total dur |
|---|---|---|---|---|---|
| agent-9161 (16KB) | 1 | 3 | 1 | $8.24 | 1271s |
| agent-9162 (32KB) | 2 | 3 | 0 | $15.20 | 1706s |
| agent-9163 (48KB) | 2 | 3 | 0 | $8.77 | 1086s |

**Total cost: $32.21** (vs $22 forecast; ~50% over, driven by 9162/#649 at $12.89). **Total dur (sequential equivalent)**: 4063s ≈ 68 min; wall time ~22 min via 3-way parallelism.

## Per-issue cross-agent comparison

### #649 — Cost preview block: extend to TRON / Solana / BTC / LTC (feature)

| Size | Decision | Cost | Dur | Outcome |
|---|---|---|---|---|
| 16KB | implement | $4.35 | 550s | "shipped Solana / BTC / LTC cost preview block; TRON net-burn split to follow-up issue" |
| 32KB | implement | $12.89 | 1321s | same scope, far longer/costlier — added 4-chain renderers + injectable `fetchNonEvmNativePrice` opt; 2605 tests |
| 48KB | implement | $5.29 | 561s | same scope, terser path; "shared `renderNonEvmCostPreviewBlock` helper, wired into all four user-facing emission sites; TRON filed as follow-up" |

**Observation**: 32KB version cost 3× more for the same outcome. Possibly noise from parallel-run contention (3 agents working same target-repo simultaneously) — or a real signal that 32KB's selection of process rules increases deliberation without the layer-chain audit rule (#23, only present at 48KB) that would have caught the cross-cutting shape and phase-split it cleanly.

### #574 — resolve_ens_name has no agent-side / multi-RPC verification (rogue-MCP)

All three pushback. Quality varies in framing:

| Size | Pushback framing |
|---|---|
| 16KB | "rogue-MCP threat — every in-MCP fix routes through the same component"; filed skill issue |
| 32KB | "cross-repo scope split per maintainer direction `do 3`"; filed skill-side rule |
| 48KB | "user explicitly chose option 3 (skill-side rule) per the issue thread"; filed `vaultpilot-security-skill#43` companion |

All three correctly identified the rogue-MCP architectural-residual-risk class. 48KB cited the issue thread comment most directly; 32KB cited Fibonacci's prior pushback comment by name.

### #565 — Read-only data-plane has no integrity check (rogue-MCP, compound)

| Size | Decision | Cost | Notes |
|---|---|---|---|
| 16KB | **error** | $2.06 | **Harness contention**: worktree deleted mid-run after first SECURITY.md edit; bash gate blocked recovery paths. Agent had drafted the documentation change but couldn't commit. NOT a study signal. |
| 32KB | implement | $1.00 | Documentation-only SECURITY.md update per user directive; 2593 tests pass |
| 48KB | implement | $1.67 | Same SECURITY.md update per user directive ("none of the fixes to implement. Instead, describe this attack in security model description as not covered") |

**Note on 16KB error**: parallel-run race condition between 3 study agents on the same target-repo path. The 16KB agent had read the user directive correctly and started the right work — the failure mode was harness-contention, not trim-induced.

### #162 — bigint-buffer tracker (dep-tracker)

All three correctly pushback as tracking-class. Cost: $0.48 / $0.31 / $0.54. All cite "Action today: none" gate, verify upstream state unchanged. **Pushback rule survived all trim levels.**

### #156 — MarginFi SDK IDL stale tracker (dep-tracker)

All three correctly pushback. Cost: $0.30 / $0.45 / $0.52. All defer to prior agent's (Sofia/agent-2a3d) three-options comment from 24h ago rather than re-litigating. **Issue Analysis / Push-Back rules survived all trim levels.**

## Headline findings

1. **Pushback rate is uniform at 60% (3/5) across all three sizes.** The four advisory-class triage rules (Push-Back, Issue Analysis, Rogue-Agent-Only, Cross-Repo Scope Splits) all survive the 16KB trim and fire correctly. This is the trim policy's success — domain-load-bearing rules at utility-5 are preserved.

2. **#649 is the only cost variance signal worth investigating.** $4.35 / $12.89 / $5.29 for the same outcome suggests trim-related path divergence. The 32KB version went 3× longer than either neighbor — possibly because it has Documentation-Style + Security-Doc-Vocabulary + Smallest-Solution-Discipline rules (verbose) but lacks the layer-chain audit rule (only at 48KB) that would have phase-split early.

3. **#565 16KB error is a harness bug, not a study signal.** The agent had the right disposition (documentation-only update per user directive) and started the work; race-condition with parallel-run worktree cleanup blocked the commit. Treat the cell as missing-data; a re-run would cost ~$1-2.

4. **No outcome quality difference between 32KB and 48KB on this set.** Both implement #565 correctly, both pushback uniformly on dep-trackers and on #574. The 48KB version is faster on #649 — but a single cell can't distinguish trim-induced speedup from random sampling.

5. **The pilot is methodology-validating.** 5 issues × 3 sizes give a coarse signal: pushback rate flat, implement-quality undifferentiated, one error from harness, one cost outlier. A clean curve would need N≥10 per size with at least 2-3 issues per outcome bucket.

## Open scoring rubrics for operator (you)

For each cell, score 0/1:

### Pushback accuracy (3 cells × 3 agents = 9 cells)

| # | 16KB | 32KB | 48KB | Notes |
|---|---|---|---|---|
| 574 | __ | __ | __ | All cited rogue-MCP / cross-repo split + filed skill issue. Was each pushback substantively right? |
| 162 | __ | __ | __ | All correctly identified tracking + Action-today-none. |
| 156 | __ | __ | __ | All deferred to Sofia's prior three-options comment. |

### PR correctness (3 cells × 3 agents = 5 cells, since #565 16KB errored)

| # | 16KB | 32KB | 48KB | Notes |
|---|---|---|---|---|
| 649 | __ | __ | __ | All implemented Solana/BTC/LTC; TRON deferred. 32KB cost 3× more — does its diff differ in scope? |
| 565 | (err) | __ | __ | Both implemented documentation-only SECURITY.md update per user directive. |

Full untruncated `reason` (PR body) text for implement cells is at `/tmp/study_pr_bodies.txt` (27 lines).

## Cost overshoot — single-cell driver

`agent-9162 / #649 = $12.89` accounts for 40% of total spend ($32.21). All other cells: $0.30–$5.29. Median cell cost: $1.00. If you re-run the pilot, capping per-cell at $5–6 (`--max-turns` or similar) would land closer to the $22 forecast.

## What this pilot tells us about #179's full design

- **3 sizes is too few to fit a curve.** Need at least 4-5 points to see a non-linear relationship. The pilot's signal is mostly "trims preserve domain rules"; it doesn't yet measure context-cost.
- **5 issues is too few to break out outcome buckets cleanly.** With pushback rate locked at 3/5, only 2 implement cells per agent measure quality — high variance.
- **Issue diversity matters more than count.** A 7-size study at N=5 mixed-class issues (1 feature + 1 advisory + 1 dep-tracker per dispatch) might show curvature that this pilot misses.
- **Parallel dispatch causes harness contention.** The 9161/#565 worktree deletion would be more frequent at 7-way parallelism. The full study probably needs sequential dispatch or per-agent target-repo clones.

## Methodology-validation verdict

**Trim policy works**: domain rules (utility-5) preserved at 16KB; pushback-class triage fires uniformly. **Methodology has measurement gaps**: cost variance on #649 needs investigation before scaling; harness contention needs sequential dispatch; sample size needs to grow before fitting a curve. Recommendation: don't extrapolate to a full 7-size study without first re-running this pilot sequentially (no parallel contention) and adding 5 more issues per cell.
