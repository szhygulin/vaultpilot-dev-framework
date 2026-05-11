# Phase B — Tailored agent mint results

Run date: 2026-05-11. Minter: [`build-tailored-agents.cjs`](build-tailored-agents.cjs). Source super-agent file: [`agent-super.CLAUDE.md`](../super-agent/agent-super.CLAUDE.md) (122 sections, 209 KB), committed in [PR #276](https://github.com/szhygulin/vaultpilot-dev-framework/pull/276). Selections: [`phase-a-results.tar.gz`](phase-a-results.tar.gz) → `selections.json`. Plan: [`feature-plans/super-agent-tailored-experiment-plan.md`](../../../feature-plans/super-agent-tailored-experiment-plan.md).

Audit data: [`phase-b-results.tar.gz`](phase-b-results.tar.gz) (sizes.json + all 13 minted CLAUDE.mds renamed `issue-N.CLAUDE.md`).

## Headline

| Metric | Value |
|---|---|
| Agents minted | 13/13 |
| Naming convention | `agent-super-tailored-<issueId>` |
| Source-order preserved | yes (sections appear in `agent-super.CLAUDE.md` order, not selector pick-order) |
| Sentinel headers | preserved (every kept H2 retains its `<!-- run:R issue:#N outcome:O ts:T -->` line) |
| Total mint cost | $0 (deterministic, no LLM calls) |
| Wall | <1 s |

The minter is idempotent: re-running against the same `selections.json` produces byte-identical CLAUDE.mds. Registry mutations go through `mutateRegistry()` which snapshots `state/agents-registry.json` to `state/agents-registry.snapshot-pre-tailored.json` before writing (defense in depth, mirrors prose-baseline §11). No prior snapshot existed → registry was created fresh in this worktree.

## Per-issue size distribution

Sorted by bytes ascending. Bytes include the auto-generated `# Tailored CLAUDE.md for issue #N` header (~280 bytes overhead per file).

| Issue | Repo | Sections | % of 122 | Bytes |
|---:|---|---:|---:|---:|
| 162 | vaultpilot-mcp | 6 | 4.9% | 9,251 |
| 157 | vaultpilot-dev-framework | 7 | 5.7% | 10,711 |
| 168 | vaultpilot-dev-framework | 10 | 8.2% | 14,206 |
| 186 | vaultpilot-dev-framework | 10 | 8.2% | 15,400 |
| 156 | vaultpilot-mcp | 10 | 8.2% | 15,652 |
| 180 | vaultpilot-dev-framework | 13 | 10.7% | 18,958 |
| 178 | vaultpilot-dev-framework | 16 | 13.1% | 22,532 |
| 172 | vaultpilot-dev-framework | 17 | 13.9% | 25,328 |
| 185 | vaultpilot-dev-framework | 17 | 13.9% | 26,695 |
| 665 | vaultpilot-mcp | 15 | 12.3% | 28,478 |
| 649 | vaultpilot-mcp | 21 | 17.2% | 31,564 |
| 574 | vaultpilot-mcp | 28 | 23.0% | 50,432 |
| 565 | vaultpilot-mcp | 37 | 30.3% | 62,580 |

Median per-issue size: **18,958 bytes** (#180) vs **209 KB** for the unfiltered super-agent. The tailored arm carries on median ~9% of the super-agent's prose into each dispatch's prompt.

Section-count and byte-size are correlated but not strictly monotonic — e.g. #665 has 15 sections / 28,478 bytes vs #185's 17 sections / 26,695 bytes. Ordering by section count and ordering by byte count diverge because per-section prose length varies (some H2s are 500 bytes, some 5 KB).

## Verification

Cross-check between `selections.json`, the minted CLAUDE.mds, and `agent-super.CLAUDE.md`:

| Check | Result |
|---|---|
| All 13 issues minted (count) | 13/13 |
| Per-issue: selections kept-count == minted H2 count | 13/13 match |
| Per-issue: H2 count == sentinel-header count | 13/13 match |
| Per-issue: section order matches source order in super-agent file | 13/13 match (spot-checked #565 ascending `s003..s121`) |
| Registry: all 13 agents present + tagged `super-agent-tailored` | 13/13 |
| Registry: each agent has `tags: ["super-agent-tailored", "issue-N"]` | 13/13 |

Spot-check rendering — #162 (smallest, 6 sections):

```
# Tailored CLAUDE.md for issue #162 (szhygulin/vaultpilot-mcp)

Built by `research/curve-redo-bundle/super-agent-tailored/build-tailored-agents.cjs`.
Source: `research/curve-redo-bundle/super-agent/agent-super.CLAUDE.md` (122 sections).
Selector: claude-opus-4-7[1m]; kept 6/122 sections.

<!-- run:run-2026-05-01T13-48-07-936Z issue:#162 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Upstream-gated tracker issues: verify preconditions before acting, then push back with a status summary
...
```

Header preserves provenance (source super-agent file + selector model + keep ratio). Sentinel header on each section retains the original `runId` / `issueId` / `outcome` / `timestamp` from the super-agent file, so `agents split` / `agents prune-lessons` / similar operator tooling can still attribute each section back to the run that produced it.

## What's gitignored vs committed

**Committed in this PR:**
- [`phase-b-results.md`](phase-b-results.md) (this file)
- [`phase-b-results.tar.gz`](phase-b-results.tar.gz) — sizes.json + 13 minted CLAUDE.mds (84 KB)

**Local runtime state (gitignored, regenerable):**
- `agents/agent-super-tailored-{156,157,162,168,172,178,180,185,186,565,574,649,665}/CLAUDE.md` (13 files, 348 KB total)
- `state/agents-registry.json` (13 new entries)
- `research/curve-redo-data/super-agent-tailored/sizes.json`

To rehydrate from this PR alone: extract the tarball + re-run [`build-tailored-agents.cjs`](build-tailored-agents.cjs) (the minter rebuilds the registry too).

## Next phase

Phase C dispatches K=3 cells per issue against the 13 minted agents — 39 cells total. Estimated cost ~$45 based on the prose-baseline arm's per-cell mean. Goes through `vp-dev run`'s approval gate — operator confirmation required before launch.

Dispatcher: [`dispatch-tailored-parallel.sh`](dispatch-tailored-parallel.sh) (thin wrapper over `dispatch-specialist-redo-parallel.sh` with `OUT_DIR` swap + symlink of `picks.tsv` → `picks-tailored.tsv`).
