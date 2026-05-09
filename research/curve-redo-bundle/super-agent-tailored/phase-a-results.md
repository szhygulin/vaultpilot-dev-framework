# Phase A — Per-issue rule selection results

Run date: 2026-05-09. Selector: Opus 4.7 (`claude-opus-4-7[1m]`, ~58k-token cached system prompt). Corpus: 13 issues from `corpus.json`. Plan: [`feature-plans/super-agent-tailored-experiment-plan.md`](../../../feature-plans/super-agent-tailored-experiment-plan.md).

Audit data: [`phase-a-results.tar.gz`](phase-a-results.tar.gz) (selections.json + picks-tailored.tsv).

## Headline

| Metric | Value |
|---|---|
| Issues processed | 13/13 |
| Total selector cost | **$3.74** (within $3-5 envelope) |
| Wall (sequential) | ~21 min |
| First-call cache write | 88,030 tokens |
| Avg cache read (calls 2..13) | 86,172 tokens (~98% of input from cache) |
| Median per-issue cost | $0.21 (cache reads); first call $0.76 (cache write) |

Selector ran end-to-end clean after the bug fixes in PR [#278](https://github.com/szhygulin/vaultpilot-dev-framework/pull/278) (numeric section IDs + duplicate-tolerant validator). No selector warnings on any of 13 issues.

## Keep-count distribution

13 issues, sorted by section count kept (ascending):

| Issue | Repo | Decision class | Kept | % of 122 | Cost |
|---:|---|---|---:|---:|---:|
| 156 | vaultpilot-mcp | pushback | **3** | 2.5% | $0.76 |
| 162 | vaultpilot-mcp | pushback | 6 | 4.9% | $0.20 |
| 157 | vaultpilot-dev-framework | implement | 10 | 8.2% | $0.19 |
| 168 | vaultpilot-dev-framework | implement | 11 | 9.0% | $0.19 |
| 186 | vaultpilot-dev-framework | implement | 12 | 9.8% | $0.31 |
| 180 | vaultpilot-dev-framework | implement | 15 | 12.3% | $0.34 |
| 649 | vaultpilot-mcp | implement | 15 | 12.3% | $0.20 |
| 178 | vaultpilot-dev-framework | implement | 16 | 13.1% | $0.22 |
| 172 | vaultpilot-dev-framework | implement | 22 | 18.0% | $0.34 |
| 574 | vaultpilot-mcp | pushback | 23 | 18.9% | $0.30 |
| 665 | vaultpilot-mcp | pushback | 23 | 18.9% | $0.18 |
| 185 | vaultpilot-dev-framework | implement | 23 | 18.9% | $0.33 |
| 565 | vaultpilot-mcp | implement | **26** | 21.3% | $0.19 |

Median keep-count: 15 (12.3% of pool). Range 3-26 sections. The selector consistently dropped 78-97% of the super-agent prose per issue.

## Pattern analysis

- **Tight-scope issues kept few sections.** #156 (MarginFi SDK stale-IDL dependency tracker) kept 3 sections — all "upstream-gated tracker pushback" patterns. #157 (vp-dev launch breadcrumb, narrow CLI feature) kept 10 sections, mostly prompt-assembly and CLI-conventions.
- **Cross-cutting / threat-modeling issues kept more.** #565 (read-only data-plane integrity, 21% kept) kept the entire rogue-MCP / self-attestation / cross-RPC-divergence cluster. #185 (adversarial smoke-test against closed security finding) kept 23 sections spanning audit-existing-implementation, fix-layer scope, and skill-side trust mandates.
- **Pushback class doesn't predict keep-count.** Two pushback issues kept few (#156: 3, #162: 6); two kept many (#574: 23, #665: 23). The selector seems to follow domain breadth, not decision class.
- **Cache discount is real and large.** Calls 2-13 averaged 86,172 cached input tokens per call — Opus billed those at the cache-read rate (~10% of input price), driving per-call cost from $0.76 (call 1, cache write) to $0.18-0.34 (calls 2-13, cache read). Without caching, this run would have been ~$10-15 instead of $3.74.

## Sample selector rationales

Inspect `selections.json` for the full audit. Three illustrative spot-checks:

**#156 — 3/122 kept** (dependency tracker, pushback):
- `s020`: "Directly applicable: upstream-gated tracker issue with 'no action today' language—this is the canonical pushback pattern."
- `s072`: "Tracking issue may have prior pushback comments; if re-dispatched, surfacing prior pushback applies directly."
- `s096`: "Directly applicable: tracking issue with explicit upstream-package and live-bite gates—exact pattern this section governs."

**#565 — 26/122 kept** (data-plane integrity, rogue-MCP threat):
- `s080`: "Highly relevant: this is the canonical precedent for #565's exact threat model."
- `s104`: "Directly relevant: trust-domain independence audit before approving fix."
- `s121`: "Directly applies: reject MCP-emitted digest/proof when MCP is the named adversary."
- (plus 23 more, all in the rogue-MCP / self-attestation / cross-RPC-divergence cluster)

**#186 — 12/122 kept** (extend `stripOverlappingSections` to 3-way):
- `s004`: "Directly about buildAgentSystemPrompt assembly ordering, the file being modified."
- `s088`: "Multi-site thread-through guidance applies when extending stripOverlappingSections and threading new layer through callers/tests."
- `s122`: "Issue extends existing stripOverlappingSections from 2-way to 3-way — directly the 'extend with a variant' pattern."

The rationales read coherent and on-topic — the selector is making sensible per-issue judgments rather than collapsing on a "drop all" or "keep all" prior.

## Run history (for the audit log)

This is the third Phase A attempt; the first two surfaced two distinct bugs in `select-rules.cjs`:

1. **Run 1** (2026-05-09): 8/13 issues completed at $3.21 before crashing on issue #172 — Opus output a 113-char slug that didn't match the parser's 80-char-truncated label. Documented in PR [#278](https://github.com/szhygulin/vaultpilot-dev-framework/pull/278) commit 1.
2. **Run 2** (post slugify-cap fix): 1/13 issues completed at $0.83 before crashing on issue #162 — Opus emitted a duplicate sectionId (model-level repetition). Documented in PR [#278](https://github.com/szhygulin/vaultpilot-dev-framework/pull/278) commit 2 (numeric IDs + duplicate-tolerant validator).
3. **Run 3** (post both fixes): clean — 13/13 issues, $3.74. This is the data this writeup describes.

Total Phase A spend across all attempts: ~$7.78 (sunk cost on runs 1 and 2 was ~$4.04 of selector calls before the crashes). Future re-runs from a clean state will be ~$3.74.

## Files

- [`phase-a-results.tar.gz`](phase-a-results.tar.gz) — selections.json (per-issue keep/drop with rationales) + picks-tailored.tsv (issue → agent map for Phase C dispatcher).
- `research/curve-redo-data/super-agent-tailored/selections.json` (gitignored runtime copy).
- `research/curve-redo-data/super-agent-tailored/picks-tailored.tsv` (gitignored runtime copy).

## Next phase

Phase B mints `agent-super-tailored-<issueId>` × 13, each carrying the selected H2 sections as `agents/<id>/CLAUDE.md`. Phase C dispatches K=3 cells per issue (39 cells total, ~$45) — same shape as the prose-baseline arm.

Phase A budget left untouched: $11.26 of the $15 aggregate cap (re-runs welcome if the selector prompt or section pool changes).
