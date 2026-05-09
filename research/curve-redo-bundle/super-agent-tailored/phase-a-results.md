# Phase A — Per-issue rule selection results

Run date: 2026-05-09. Selector: Opus 4.7 (`claude-opus-4-7[1m]`, ~58k-token cached system prompt). Corpus: 13 issues from `corpus.json`. Plan: [`feature-plans/super-agent-tailored-experiment-plan.md`](../../../feature-plans/super-agent-tailored-experiment-plan.md).

Audit data: [`phase-a-results.tar.gz`](phase-a-results.tar.gz) (selections.json + picks-tailored.tsv).

## Headline

| Metric | Value |
|---|---|
| Issues processed | 13/13 |
| Total selector cost | **$3.04** |
| Wall (parallel=5) | **~9 min** |
| Wall equivalent if sequential | ~21 min (5×) |
| Cache reads (all 13 calls) | mean 88,298 tokens (~98% of input from cache) |
| Median per-issue cost | $0.20 |

Run config: `--parallel 5 --force` against fresh `agents-super.CLAUDE.md` snapshot (122 sections, 209 KB) committed in [#276](https://github.com/szhygulin/vaultpilot-dev-framework/pull/276). All bug fixes from [#278](https://github.com/szhygulin/vaultpilot-dev-framework/pull/278) and parallelization from [#279](https://github.com/szhygulin/vaultpilot-dev-framework/pull/279) merged into main before this run.

Selector ran end-to-end clean — 0 warnings, 0 retries, 0 cap hits. The first batch hit the prompt cache from a prior run (0 cache write tokens for the warm-up call); all subsequent calls hit cache as expected.

## Keep-count distribution

13 issues, sorted by section count kept (ascending):

| Issue | Repo | Decision class | Kept | % of 122 | Cost |
|---:|---|---|---:|---:|---:|
| 162 | vaultpilot-mcp | pushback | **6** | 4.9% | $0.26 |
| 157 | vaultpilot-dev-framework | implement | 7 | 5.7% | $0.30 |
| 156 | vaultpilot-mcp | pushback | 10 | 8.2% | $0.26 |
| 168 | vaultpilot-dev-framework | implement | 10 | 8.2% | $0.17 |
| 186 | vaultpilot-dev-framework | implement | 10 | 8.2% | $0.30 |
| 180 | vaultpilot-dev-framework | implement | 13 | 10.7% | $0.36 |
| 665 | vaultpilot-mcp | pushback | 15 | 12.3% | $0.19 |
| 178 | vaultpilot-dev-framework | implement | 16 | 13.1% | $0.19 |
| 172 | vaultpilot-dev-framework | implement | 17 | 13.9% | $0.19 |
| 185 | vaultpilot-dev-framework | implement | 17 | 13.9% | $0.26 |
| 649 | vaultpilot-mcp | implement | 21 | 17.2% | $0.18 |
| 574 | vaultpilot-mcp | pushback | 28 | 23.0% | $0.19 |
| 565 | vaultpilot-mcp | implement | **37** | 30.3% | $0.19 |

Median keep-count: 13 (10.7% of pool). Range 6-37 sections. The selector consistently dropped 70-95% of the super-agent prose per issue.

## Pattern analysis

- **Tight-scope issues kept few sections.** #162 (bigint-buffer dependency tracker) kept 6 — the canonical "upstream-gated tracker pushback" cluster. #157 (vp-dev launch breadcrumb, narrow CLI feature) kept 7.
- **Cross-cutting / threat-modeling issues kept more.** #565 (read-only data-plane integrity, 30% kept) selected the entire rogue-MCP / self-attestation / cross-RPC-divergence cluster plus skill-side trust-domain rules. #574 (resolve_ens cross-RPC verification, 23% kept) similarly broad.
- **Pushback class doesn't predict keep-count.** Pushback issues span 6-28 keeps; implement issues span 7-37 keeps. The selector follows domain breadth over decision class.
- **Cache discount sustained.** All 13 calls billed at the cache-read rate (~10% of input price), driving per-call cost from a typical $1.5-2 uncached down to $0.17-0.36 cached. Without caching, this run would have been ~$10-15.
- **Parallelization speed-up matched projection.** Wall: 1 warm-up call (~107s) + 3 batches of ~75-130s each = ~9 min. Vs ~21 min sequential. Same cost ($3.04 here vs $3.74 sequential — slightly cheaper here because the prior run's cache was still warm for the warm-up call, eliminating the cache-write premium entirely).

## Sample selector rationales

Inspect `selections.json` for the full audit. Three illustrative spot-checks:

**#162 — 6/122 kept** (bigint-buffer dependency tracker, pushback):
- `s020`: "Directly applicable: this is the canonical upstream-gated tracker pushback pattern."
- `s072`: "Tracking issue may have prior pushback comments; surfacing them on re-dispatch applies."
- `s096`: "Directly applicable: tracking issue with explicit upstream-package gates."
- (plus 3 more dependency-tracker / pushback-discipline sections)

**#565 — 37/122 kept** (data-plane integrity, rogue-MCP threat):
- `s080`: "Highly relevant: this is the canonical precedent for #565's exact threat model."
- `s104`: "Directly relevant: trust-domain independence audit before approving fix."
- `s121`: "Directly applies: reject MCP-emitted digest/proof when MCP is the named adversary."
- (plus 34 more, all in the rogue-MCP / self-attestation / cross-RPC-divergence / skill-side trust cluster)

**#186 — 10/122 kept** (extend `stripOverlappingSections` to 3-way):
- `s004`: "Directly about buildAgentSystemPrompt assembly ordering, the file being modified."
- `s122`: "Issue extends existing stripOverlappingSections from 2-way to 3-way — the 'extend with a variant' pattern."
- (plus 8 more prompt-assembly + commit-discipline sections)

The rationales read coherent and on-topic — selector is making per-issue judgments rather than collapsing on a uniform prior.

## Run history (audit log)

This is the third committed Phase A attempt. Two prior runs surfaced bugs in `select-rules.cjs`, both fixed in PR [#278](https://github.com/szhygulin/vaultpilot-dev-framework/pull/278):

1. **Run 1**: 8/13 issues, $3.21, crashed on #172 — Opus output a 113-char slug; parser truncated to 80. → fixed in #278 commit 1.
2. **Run 2**: 1/13 issues, $0.83, crashed on #162 — Opus emitted a duplicate sectionId. → fixed in #278 commit 2 (numeric IDs + duplicate-tolerant validator).
3. **Run 3** (sequential, post-fixes): 13/13 issues, $3.74. Discarded as superseded; PR [#281](https://github.com/szhygulin/vaultpilot-dev-framework/pull/281) closed in favor of this re-run.
4. **Run 4** (this run, parallel=5): 13/13 issues, $3.04. Median 13/122 keeps, range 6-37.

Total Phase A spend across all attempts: ~$10.82 (sunk cost on aborted runs ~$4.04 + the discarded sequential run ~$3.74 + this run $3.04). Future re-runs from clean state at parallel=5 ≈ $3.04 / ~9 min wall.

Why redo run 3? Operator-flagged as corrupt (likely picked up stale state from the in-flight bug-fix iteration). This run was launched against fresh `origin/main` after both #278 and #279 merged; selector code is post-fix, runtime data wiped before launch.

## Files

- [`phase-a-results.tar.gz`](phase-a-results.tar.gz) — selections.json (per-issue keep/drop with rationales) + picks-tailored.tsv (issue → agent map for Phase C dispatcher).
- `research/curve-redo-data/super-agent-tailored/selections.json` (gitignored runtime copy).
- `research/curve-redo-data/super-agent-tailored/picks-tailored.tsv` (gitignored runtime copy).

## Next phase

Phase B mints `agent-super-tailored-<issueId>` × 13, each carrying the selected H2 sections as `agents/<id>/CLAUDE.md`. Phase C dispatches K=3 cells per issue (39 cells total, ~$45) — same shape as the prose-baseline arm.

Phase A budget left untouched: $11.96 of the $15 aggregate cap.
