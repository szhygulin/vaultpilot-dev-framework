# Plan: curve-redo follow-up — orchestrator-picked specialists vs. trim baseline

## Context

The just-merged curve-redo run ([leg-1 results PR #230](https://github.com/szhygulin/vaultpilot-development-agents/pull/230)) measured A+B quality across **18 fixed `agent-916a-trim-*` agents** (one parent, trimmed CLAUDE.md at 6 sizes × 3 seeds) on the 13-issue corpus. Per-trim mean Q was nearly flat (range 63.6–76.7 across 6 sizes), suggesting CLAUDE.md size alone isn't the dominant lever.

This follow-up tests an orthogonal hypothesis: **orchestrator-picked specialists outperform fixed trim agents** because (a) their evolved per-agent CLAUDE.md encodes domain-specific lessons, and (b) the picker's tag-vs-label Jaccard match supplies issue-specific expertise. Same A+B formula, same isolation contract (no target / no user-global CLAUDE.md), K=3 replicates per (agent, issue) to absorb LLM stochasticity. Direct comparison against the merged trim-baseline tarballs.

Hypothesis: per-issue mean Q (specialist arm) > per-issue mean Q (trim arm), paired Wilcoxon `alternative="greater"`, n=13.

## Design summary

- **Picker**: `pickAgents()` from `src/orchestrator/orchestrator.ts:283` called as a library, with the 18 trim agents filtered out via a `regOverride` copy (no registry mutation). 1 agent picked per issue. `general` fallback / fresh mint accepted as treatment, stratified by rationale in the analysis.
- **Dispatch**: Thin shell loop per `feature-plans/curve-redo-data/dispatch-leg1.sh`, NOT `vp-dev research bench-specialists` — the bench command's `runBenchDispatch` (`src/research/specialistBench/dispatch.ts:188-209`) hardcodes argv and doesn't plumb the `--no-target-claude-md` / `--capture-diff-path` / `--model` / `--replay-base-sha` flags.
- **Replicates**: same agent for all 3 replicates (deterministic pick). Runs sequentially on the same per-agent clone to avoid worktree races; agents in parallel up to 4-wide.
- **Cell ID**: `bench-r{N}-<agentId>-<issueId>` — the `bench-r{N}-` prefix follows `specialistBench/dispatch.ts:145`'s convention so the existing aggregator can group replicates.
- **Score path**: reuses leg-1 testRunner + reasoningJudge end-to-end (PRs [#228](https://github.com/szhygulin/vaultpilot-development-agents/pull/228) + [#229](https://github.com/szhygulin/vaultpilot-development-agents/pull/229) already merged). Symlinked `node_modules` from canonical clones; `npm ci` auto-runs as safety net.
- **Comparator**: new `combine-and-compare.cjs` that reuses `pairByIssue` from `src/research/specialistBench/aggregate.ts:135-176`, swapping its heuristic `qualityFromDecision` for A+B-formula values via existing `samplesFromCellScores` (mirroring `feature-plans/curve-redo-bundle/combine-legs.cjs:51-73`).

## File layout

All under `/Users/s/dev/vaultpilot/vaultpilot-development-agents/`:

```
feature-plans/curve-redo-bundle/                    (committed)
└── specialist-redo-results.md                       (NEW — final writeup)
└── specialist-redo-results.tar.gz                   (NEW — bundled artefacts)

feature-plans/curve-redo-data/specialist-redo/      (gitignored)
├── pick-specialists.cjs                             (NEW — calls pickAgents, writes picks.tsv)
├── picks.tsv                                        (issueId\tagentId\trationale\tscore\tleg)
├── dispatch-specialist-redo.sh                      (NEW — shell loop, K=3 replicates)
├── score-specialist-redo.sh                         (NEW — parameterized score-leg1.sh)
├── combine-and-compare.cjs                          (NEW — paired comparator)
├── logs-leg1/, logs-leg2/                          (curveStudy output: 18 + 21 logs)
├── diffs-leg1/, diffs-leg2/                        (39 captured diffs)
├── scores-leg1/, scores-leg2/                      (39 tests.json + 39 judge.json)
└── specialist-redo-comparison.json                  (combiner output: per-issue table + Wilcoxon p)
```

## Critical files (existing, to read or reuse)

| Path | Purpose |
|---|---|
| `src/orchestrator/orchestrator.ts:283-372` | `pickAgents()` — library call from pick-specialists.cjs |
| `src/orchestrator/routing.ts:13-179` | `SPECIALIST_THRESHOLD = 0.25`, jaccard, twoPhasePick |
| `src/research/specialistBench/aggregate.ts:135-176` | `pairByIssue()` — paired-difference engine |
| `src/research/specialistBench/stats.ts` | `wilcoxonSignedRankPaired` — primary test |
| `feature-plans/curve-redo-bundle/combine-legs.cjs:51-73` | A+B-via-`samplesFromCellScores` template |
| `feature-plans/curve-redo-data/dispatch-leg1.sh` | Dispatcher template |
| `feature-plans/curve-redo-data/score-leg1.sh` | Scorer template (only paths change) |
| `feature-plans/curve-redo-bundle/corpus.json` | Per-issue framework / baseSha / testsDestRelDir |

## Cost & wall-time

| Component | Per cell | Cells | Subtotal |
|---|---:|---:|---:|
| Coding agent (Sonnet 4.6, larger CLAUDE.md ~60-100 KB) | ~$1.40 | 39 | $55 |
| Reasoning judge (Opus K=3) | ~$0.50 | 39 | $20 |
| **Total worst-case** | | | **~$75** |

Defense-in-depth cap: pass `--max-total-cost-usd 200` to the dispatch loop; per-cell `VP_DEV_MAX_COST_USD=10`.

Wall: ~30 min (issues parallel 4-wide, replicates sequential per agent's clone).

## Risks (must-handle before dispatch)

1. **Trim contamination of picks** — the 18 trim agents would dominate Jaccard scores. `pick-specialists.cjs` filters them via `regOverride` and asserts zero `agent-916a-trim-*` IDs in `picks.tsv` before exiting.
2. **Closed-issue replay** — leg-2 (and 3 leg-1 closed issues) need `--replay-base-sha` from corpus to roll worktree back. Each agent's clone runs cells sequentially: `git reset --hard $baseSha` then spawn.
3. **Per-agent CLAUDE.md drift across replicates** — `--skip-summary` freezes `agents/<id>/CLAUDE.md`. All 3 replicates must use the same flag (already in dispatch-leg1.sh template).
4. **Concurrency on shared clone** — multiple cells on the same clone race the worktree. Group cells by agent; serialize within agent; parallelize across agents.

## Execution steps

1. **Snapshot registry**: `cp state/agents-registry.json state/agents-registry.snapshot-pre-specialist-redo.json`. Restore on completion.

2. **Write `pick-specialists.cjs`**: loads `dist/src/state/registry.js` + `dist/src/orchestrator/orchestrator.js`. For each of 13 corpus issues, fetches labels via `gh issue view --json labels`, calls `pickAgents({reg: filteredReg, pendingIssues:[issue], maxParallelism: 1})`. Writes `picks.tsv`. Asserts no trim-agent picks.

3. **Operator review of `picks.tsv`** — eyeball distribution (specialist vs. general count). Gate before dispatch.

4. **Smoke test**: dispatch ONE cell on issue #156 (smallest-class, fastest pushback). Verify log has envelope JSON, diff captured, score-loop runs end-to-end.

5. **Pre-install**: `npm ci` in each unique-agent's clone (matches leg-1 Step 2.5). One-time ~30s × N agents (≤ 13).

6. **Full dispatch**: `bash dispatch-specialist-redo.sh 1` then `... 2`. 39 cells total, ~30 min wall.

7. **Score**: `bash score-specialist-redo.sh 1` then `... 2`. ~15 min, ~$20 judge cost.

8. **Combine + compare**: `node combine-and-compare.cjs --baseline-leg{1,2}-{logs,scores} ... --treatment-leg{1,2}-{logs,scores} ... --picks ... --output specialist-redo-comparison.json`. Prints headline: per-issue paired diff table, Wilcoxon p, Hedges' g, picks distribution + per-rationale stratified means.

9. **Hand-author `specialist-redo-results.md`** following `leg1-results.md`'s structure: headline metrics, per-issue paired table (treatment − control), test result, rationale stratification, caveats.

10. **Bundle + PR**: `tar czf feature-plans/curve-redo-bundle/specialist-redo-results.tar.gz -C feature-plans/curve-redo-data specialist-redo/`. Commit `specialist-redo-results.md` + tarball on a feature branch. Open dedicated results PR (don't bundle into a fix PR, repeating leg-1's mistake).

11. **Restore registry**: `diff` the snapshot vs current state; if drift exists, restore. The `--skip-summary` flag should prevent any drift, but verify.

## Verification

- **Pick-time**: `awk -F$'\t' '{print $3}' picks.tsv | sort | uniq -c` shows the rationale distribution. Assert `grep -c agent-916a-trim picks.tsv == 0`.
- **Dispatch-time**: after each leg, `ls specialist-redo/logs-leg${LEG}/bench-r*.log | wc -l` matches the expected cell count (18 for leg 1, 21 for leg 2). `find specialist-redo/diffs-leg${LEG}/ -size +0 | wc -l` should roughly equal the implement-decision count.
- **Score-time**: `for f in specialist-redo/scores-leg{1,2}/*-tests.json; do jq -r '.applyCleanly' $f; done | sort | uniq -c` should be all `true`. Score JSON count equals log count.
- **Combine-time**: stdout headline includes `n=13 paired issues, p=…` and the per-issue table. JSON output has `treatmentArm.cellCount: 39` and `baselineArm.cellCount: 234`.
- **Sanity**: per-issue diff `dQ` should not be all-zero (would suggest scoring collapse). Mean coefficient of variation across 3 replicates < ~30% per issue (high CV = noisy issue, flag in writeup).

## Out of scope

- Curve fitting along trim-size axis — not relevant; specialists aren't trimmed.
- Per-agent attribution — answers "did specialist X help on issue Y?" but the experiment is a 13-issue paired test, not a per-agent ranking.
- Re-running the trim baseline at K=3 — would cost another ~$300, not necessary for the planned comparison.

## Findings from picker dry-run (2026-05-07)

Ran `pick-specialists.cjs` against the live registry. Result: **all 13 issues map to a single agent (`agent-92ff` "Alonzo")** with score `0.1522` on every cell.

Mechanism (verified against `src/orchestrator/routing.ts:37-40`):

```ts
score = jaccard(agent.tags, issue.labels) + 0.05 * Math.log(1 + agent.issuesHandled);
```

- 8 of 13 issues have **0 labels** (mostly leg-2 closed issues, label-stripped or never labeled). Jaccard collapses to 0 for every agent.
- 5 of 13 issues have **1-2 labels** that no specialist's tag set overlaps with much. Jaccard small.
- The `0.05 * log(1 + issuesHandled)` recency-experience bump dominates: agents with `issuesHandled >= 20` (like agent-92ff at 20) score `0.05 * log(21) = 0.152`.
- Tiebreaker is `lastActiveAt desc`. agent-92ff was the most recently active eligible non-trim specialist → wins every issue.

This is the picker's production behavior, but it collapses the "specialist diversity" intent of the experiment. Three options for the implementer:

1. **Proceed as-is**. Test "evolved-CLAUDE.md agent-92ff at K=3 vs 18 trim agents at K=1". Still validates the original hypothesis (orchestrator's choice > fixed trim agents) — just narrower in scope. Wall ~100 min sequential on one clone (no across-agent parallelism); cost ~$75 unchanged. Surface the single-agent collapse explicitly in the writeup.
2. **Enrich corpus labels**. Manually add labels to the 8 zero-label issues (e.g., from issue title keyword extraction) before re-running the picker. Restores tag-vs-label signal. Recommended if the user wants the experiment to test "specialist diversity vs trim diversity"; cost negligible.
3. **Modify the scoring formula for this experiment**. Patch `score = jaccard only` (zero out the issuesHandled bump) in a forked picker. Forces agent diversity by tag overlap. Requires passing `regOverride` that strips agents with zero Jaccard for the issue → fall through to fresh-mint. Diverges from production picker semantics; least recommended.

The picker also reveals a structural finding worth its own follow-up issue: **`scoreAgentIssue` returns positive for any agent with prior history, even on zero-label issues**, which means the threshold check `if (s.score <= 0) break` in `pickAgents` (orchestrator.ts:327) never triggers for established agents. The intended "no specialist matches" branch (mint-fresh, fall-through to general) is unreachable in practice once the registry has any seasoned agents. May or may not be a bug depending on intent — but worth clarifying in the codebase, since the curve-redo experiment exposed it.

Picker output committed locally (gitignored) at `feature-plans/curve-redo-data/specialist-redo/picks.tsv`; `pick-specialists.cjs` in the same directory.
