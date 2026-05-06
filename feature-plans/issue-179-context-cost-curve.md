# Issue #179 — accuracyDegradationFactor curve study

Operator-led research, run by Claude Code. Pilot scope (3 sizes × 5 issues) chosen by user 2026-05-06 to bound study cost before any commitment to the full 7-size design in the issue body.

## Pilot scope (vs. issue-body design)

| Dimension | Issue body | Pilot |
|---|---|---|
| Sizes | 8 / 16 / 24 / 32 / 40 / 48 / 64 KB (7) | **16 / 32 / 48 KB (3)** |
| Issues per size | ~10 | **5** (all currently-open vaultpilot-mcp) |
| Dispatches | 70 | **15** |
| Cost forecast | ~$105 | **~$22** ($1.50/issue × 15) |
| Target snapshot | frozen | **live state at dispatch time** (issue bodies don't churn during a tight time window) |

Pilot is methodology-validating: confirms the trim policy produces a measurable outcome-quality signal before scaling to the full curve. If signal is clean, scale to N=10 by adding 5 more issues from adjacent target repos. If signal is muddled, refine trim policy first.

## Study agents (live in registry)

| Agent ID | Name | CLAUDE.md size | Sections kept | Parent |
|---|---|---|---|---|
| `agent-9161` | Study 16KB | 16,445 B | 9 | agent-916a |
| `agent-9162` | Study 32KB | 32,719 B | 20 | agent-916a |
| `agent-9163` | Study 48KB | 48,830 B | 27 | agent-916a |

All three carry agent-916a's full 94-tag set so jaccard match still works; `--prefer-agent` is the dispatch-time pin (belt-and-suspenders).

## Issue set (5, vaultpilot-mcp open)

| # | Title | Class |
|---|---|---|
| 649 | Cost preview block: extend to TRON / Solana / BTC / LTC | feature work (multi-chain) |
| 574 | resolve_ens_name / reverse_resolve_ens have no agent-side or multi-RPC verification | security feature |
| 565 | MCP/skill: read-only data-plane has no integrity check — daily briefing, tax stance, market narrative all spoofable | rogue-MCP threat (compound) |
| 162 | bigint-buffer toBigIntLE() overflow tracker (12 transitive advisories) | dep-tracker (likely pushback) |
| 156 | Track MarginFi SDK stale IDL — second unknown OracleSetup variant | dep-tracker (likely pushback) |

Mix is intentional: 1 multi-chain feature, 1 security verification, 1 compound rogue-MCP, 2 dep-trackers. The dep-trackers exercise Push-Back Discipline + Smallest-Solution + Rogue-Agent-Only Triage rules, all of which exist at every trim level — so pushback rate should hold across sizes if rules survive trims, vary if they don't.

## Trim policy

The trim is itself part of the methodology. Sections were ranked on a 5-point utility scale specific to vaultpilot-mcp work (the target repo for the study):

- **Utility 5** — domain-load-bearing: rule fires on every dispatch against a `prepare_*` / signing / advisory tool issue (Crypto/DeFi Preflight, Typed-Data Signing, Cross-Repo Scope Splits, Rogue-Agent-Only Triage, Advisory-prose findings architectural, Compound/rogue-MCP findings).
- **Utility 4** — process-load-bearing with named past-incident: cross-cutting, fires on most issues (Push-Back Discipline, Issue Analysis, Smallest-Solution, SKILL.md coordinated bumps, Issues-listing-competing-mechanisms, Verify-phase-dependency-infrastructure).
- **Utility 3** — supporting / tooling-aware: Git/PR Workflow, SDK Scope-Probing, Documentation Style, Security Doc Vocabulary, Tool Usage Discipline.
- **Utility 1–2** — harness-tooling-specific or rare-fire: rules that bind only when the agent is editing this repo's harness code (Install-State-Aware, fastmcp reference, Operator ad-hoc CLI gap, Thread originating-agent identity, etc.).

Trim policy: drop bottom-up by utility until each byte budget is hit. Smaller trims are nested in larger (16KB ⊂ 32KB ⊂ 48KB).

### Drop sets

- **48KB** drops 4 sections (~9.8KB): #10 Install-State-Aware, #15 fastmcp reference, #21 Thread originating-agent, #22 Operator ad-hoc CLI gap. All harness-tooling-specific — won't fire on vaultpilot-mcp issues.
- **32KB** further drops 7 sections (~16KB): #18 Audit-trail companion fields, #19 LLM curation verdicts-only, #23 Cross-cutting layer-chain audit (5.2KB single section), #24 Verify authoritative type file, #26 Diagnose CLAUDE.md growth, #27 Calibrate HEADING_MAX, #29 Fail-soft state-collection. Drops harness rules that don't fire on target work.
- **16KB** further drops 11 sections (~16KB): #1 Git/PR Workflow, #2 Tool Usage, #3 SDK Scope-Probing, #4 Security Incident Response, #5 Chat Output Formatting, #9 Smallest-Solution, #13 Security Doc Vocabulary, #14 Documentation Style, #25 Issues-listing-competing-mechanisms, #28 Verify-phase-dependency, #30 Research-study execution. Drops process habits with named incidents — keeps only the domain triage class rules + Push-Back / Issue Analysis / Cross-Repo Scope Splits as the minimum process scaffold.

Trim files: `agents/agent-9161/CLAUDE.md` (16KB), `agents/agent-9162/CLAUDE.md` (32KB), `agents/agent-9163/CLAUDE.md` (48KB). Live agent-916a/CLAUDE.md untouched.

## Dispatch plan

Three runs against vaultpilot-mcp, one per study agent:

```bash
# Run A: agent-9161 (16KB)
npm run vp-dev -- run \
  --agents 1 --prefer-agent agent-9161 \
  --target-repo szhygulin/vaultpilot-mcp \
  --issues 649,574,565,162,156 \
  --dry-run --skip-summary --skip-dedup \
  --max-cost-usd 15 --yes

# Run B: agent-9162 (32KB)
npm run vp-dev -- run \
  --agents 1 --prefer-agent agent-9162 \
  --target-repo szhygulin/vaultpilot-mcp \
  --issues 649,574,565,162,156 \
  --dry-run --skip-summary --skip-dedup \
  --max-cost-usd 15 --yes

# Run C: agent-9163 (48KB)
npm run vp-dev -- run \
  --agents 1 --prefer-agent agent-9163 \
  --target-repo szhygulin/vaultpilot-mcp \
  --issues 649,574,565,162,156 \
  --dry-run --skip-summary --skip-dedup \
  --max-cost-usd 15 --yes
```

Notes:
- `--dry-run` intercepts push/PR/comment with synthetic responses — no production-side effects on vaultpilot-mcp.
- `--skip-summary` suppresses the post-run summarizer that would otherwise rewrite the study agent's CLAUDE.md and pollute the next run's input.
- `--skip-dedup` skips the cluster-detection LLM pass (we're dispatching exactly the same 5 numbered issues to all three agents — dedup adds noise, not signal).
- `--max-cost-usd 15` is 2× expected (~$7.50 each) per the cost-margin memory, absorbs per-issue overshoot without aborting siblings.
- Each run sequential through 5 issues; runs A/B/C parallel-OK at the shell level (separate orchestrator processes, separate study agents, no contention).

## Outcome metrics (per run)

For each (agent, issue) cell:

| Metric | Source | Aggregation |
|---|---|---|
| Outcome bucket | `state/run-*.json` `outcome` field per issue | distribution: implement / pushback / error_max_turns / error_* |
| Total turns | `logs/<runId>.jsonl` event count per issue | mean per issue per agent |
| Total cost | jsonl `cost.totalCostUsd` events | sum per agent + per issue |
| Pushback text | dry-run intercepted PR-comment payloads | retained verbatim for operator scoring |
| PR body | dry-run intercepted PR-create payloads | retained verbatim for operator scoring |

## Operator-judged scoring (after I hand back data)

User scores two binary rubrics per (agent, issue) cell:

1. **Pushback accuracy (0/1)**: for `outcome=pushback` cells, did the agent identify a real scope/design issue that the issue body warrants pushing back on? Score 1 if the pushback comment names a load-bearing reason; 0 if it pushes back on shaky/spurious grounds.
2. **PR-correctness (0/1)**: for `outcome=implement` cells, would the dry-run PR body have merged without rework if it had been a real PR? Score 1 if the proposed approach matches what would actually ship; 0 if it has visible gaps (missed requirement, wrong file, broken architecture).

Output: per-cell score table + computed outcome-quality score per agent.

## Outcome-quality composite (proposal)

Following the issue body's framing:

```
quality(agent) =
  0.40 * implement_rate(agent) +
  0.25 * pushback_accuracy_rate(agent) +
  0.20 * (1 - error_max_turns_rate(agent)) +
  0.15 * pr_correctness_rate(agent)
```

If pilot signal is clean, this fits a 3-point curve. Curve fit is intentionally loose for a pilot — won't extrapolate to 64KB without more data points.

## Known limitations (residual risk)

- **N=5 is small.** Per-cell variance is high; the curve will have wide error bars. Pilot's purpose is methodology validation, not a publishable curve.
- **vaultpilot-mcp open-issue pool is biased** toward "agent already pushbacked these once" (multiple issues are advisory-class that agent-916a's existing rules would close). Pushback rate may be near-uniform at 80%+ across all sizes — washing out trim signal. Mitigation: the 2 dep-tracker issues (#162, #156) and 1 feature issue (#649) provide the variance.
- **Live state risk**: if any of the 5 issue bodies are edited between Run A and Run C, results aren't directly comparable. Mitigation: dispatch all three runs within ~10 minutes (each takes 5–15 min wall, parallelizable). Operator commits to no issue-body edits during that window.
- **Trim policy is operator judgment, not measurement.** The 5-point utility ranking is my call, not derived from #178's Phase 1 data (which exists in the codebase but hasn't been populated for agent-916a yet — the lesson-utility records start collecting fresh after #178 shipped). Mitigation: drop sets are surfaced in this writeup so the user can audit.
- **`Research-study execution issues` rule is itself in the file at 32KB and 48KB sizes.** That rule will fire on any issue framed as "measure / curve / calibrate" — but none of the 5 vaultpilot-mcp issues match that shape, so contamination is unlikely. Worth noting in case results show anomalous pushback.

## Cost surface (forecast)

15 dispatches × $1.50 forecast = $22.50.
Per-run cap (`--max-cost-usd 15`) provides per-agent cushion.
Hard ceiling across all three runs: $45 if every run hits its cap (very unlikely given dry-run + 5 issues × $1.50 sequential).

## Stop point: confirm before launch

System is launch-ready. Before running the three commands above, user confirms:

1. Trim policy + drop sets in §"Trim policy" are acceptable.
2. 5-issue set is acceptable (or wants substitutions).
3. ~$22 forecast is acceptable.
4. Available to score pushback/PR-correctness rubrics after I return data.

If any are no, iterate before launch. If yes, launch in a single shell command (three runs in parallel via `&` or sequential — operator's call).
