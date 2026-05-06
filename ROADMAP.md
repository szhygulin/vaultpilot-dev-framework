# Roadmap

## Active

### #179 phase 3 — augment curve with real-repo data at the largest sizes

**Goal**: Phase 2 measured 10 sizes × 3 smoke-test issues and got a uniform-quality result (every agent implemented every issue). Hypothesis: smoke-test issues were too easy to differentiate. Augment the curve with real-repo issues at the **largest sizes** (where degradation, if real, should be most visible) and re-fit.

**Sample**

3 dev-agents (top 3 by CLAUDE.md size, taken from the existing trims-10 set):

| Dev-agent | CLAUDE.md size |
|---|---:|
| `agent-9187` | 43,091 B |
| `agent-9188` | 50,801 B |
| `agent-9189` | 58,654 B |

× All open issues in two real repos:

| Repo | Open count | Issues |
|---|---:|---|
| `szhygulin/vaultpilot-mcp` | 6 | #156, #162, #565, #574, #649, #665 |
| `szhygulin/vaultpilot-development-agents` | 7 | #172, #173, #179, #180, #181, #185, #186 |

= **3 agents × 13 issues = 39 new cells**.

(#179 is self-referential — the parent issue for this whole study. Keeping it in the set since "all opened issues" was the spec; flag it if the dispatched agent's behavior is anomalous.)

**Total experiment size after dispatch**

- Existing in `cells.json`: 76 cells (15 vp-mcp pilot + 28 phase-1/2 smoke-test + 33 incidental).
- New: 39 cells.
- **Total: 115 cells** (~$340 cumulative spend if the new run lands at observed real-repo means).

**Quality-score sample sizes after dispatch**

| Size | Agent | Cells available |
|---:|---|---:|
| 6,140 B | agent-9180 | 2 (smoke-only) |
| 10,255 B | agent-9181 | 2 (smoke-only) |
| 14,300 B | agent-9182 | 3 (smoke-only) |
| 18,085 B | agent-9183 | 3 (smoke-only) |
| 22,026 B | agent-9184 | 3 (smoke-only) |
| 28,911 B | agent-9185 | 3 (smoke-only) |
| 35,047 B | agent-9186 | 3 (smoke-only) |
| **43,091 B** | **agent-9187** | **3 + 13 = 16** |
| **50,801 B** | **agent-9188** | **3 + 13 = 16** |
| **58,654 B** | **agent-9189** | **3 + 13 = 16** |

**Cost forecast**

- Real-repo issues are bigger / more complex than smoke-test. Phase-1 vp-mcp pilot cells ranged $0.30 → $12.89, median ~$1.05; phase-2 smoke-test mean was $5.12.
- Real-repo mean estimate: ~$7/cell.
- 39 × $7 = **~$275** (point estimate); range **$200–$420** if cells cluster on the expensive side (#649 was $12.89 in the pilot).
- Cap each cell at $15 (`--max-cost-usd` per dispatch) to bound runaway.

**Wall time**

- 4-way parallel + per-dev-agent mutex (only 3 dev-agents, so all 3 run concurrently with one slot idle).
- 13 cells per agent sequential within each agent → 13 × ~9 min = ~120 min if cells hit the real-repo mean.
- **Forecast: 90–130 min wall**.

**Procedure**

1. Verify three dedicated clones exist:
   - `/tmp/study-clones/clone-8` for agent-9187
   - `/tmp/study-clones/clone-9` for agent-9188
   - `/tmp/study-clones/clone-10` for agent-9189
   - These already exist from phase-2; no rebuild needed if `/tmp` survived. Otherwise re-clone from `~/dev/vaultpilot/vaultpilot-mcp` and `~/dev/vaultpilot/vaultpilot-development-agents` per agent.
2. Per repo, dispatch 3 dev-agents × all open issues with `--dry-run --skip-summary --skip-dedup --max-cost-usd 15`, parallelism 3, per-dev-agent serialization.
3. Aggregate envelopes via the new tool: `aggregateLogsDir({ logsDir, prefix, agentSizes })`.
4. Append to `feature-plans/issue-179-data/cells.json` (new `phase: "phase3-real-repo"` tag).
5. Re-score per agent with rubrics if any new pushback cells appear; otherwise default scoring.
6. Re-fit both curves: `accuracyDegradationFactor` and `tokenCostFactor`.
   - Inject the 3 augmented agents' new measurements into the merged sample set.
   - Compare phase-2 quality (flat at 0.75) vs phase-3 quality (expected: differentiation if real-repo issues bite).
7. Emit a fresh JSON proposal under `feature-plans/issue-179-data/curve-proposal-phase3-<date>.json`.
8. Operator hand-merges into `ACCURACY_DEGRADATION_SAMPLES` and `TOKEN_COST_SAMPLES` if either fit reaches `F-test p < 0.05`.

**Caveats / residual risk**

- **The 3 agents are all operator-curated trims of the same parent.** They share the `Utility-5 lock` set by design; small/large differ in which low-utility sections were dropped. So the curve at these 3 points still confounds size with section identity. A truly randomized re-study (`vp-dev research plan-trims --replicates 5+`) is the proper follow-up — this phase 3 is "augment what we have" while we have time, not "do it right."
- **Missing 7 mid-and-low sizes.** This run extends only the top end. The fitted curve will be best-supported above 40KB and weakly-supported below.
- **#179 self-reference**: dispatched agents have visibility into this issue; surface anomalous cells.
- **Repo issue diversity**: `vaultpilot-mcp` issues lean security/advisory; `vaultpilot-development-agents` issues lean tooling/feature-plan. Aggregate cross-repo before fitting; per-repo fit might differ.

**Future**

- **Phase 4** (proper methodology): `vp-dev research plan-trims --parent agent-916a --sizes ... --replicates 5 --output-dir ...` → register the random-trimmed agents → curve-study against a mixed real-repo + curated-hard issue set. Targets the section-identity confound directly. Cost ≥ $500; deferred until phase 3 either confirms or refutes the size signal at the largest scale.
