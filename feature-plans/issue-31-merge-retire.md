# Plan: counterpart to split — merge / retire stale or overlapping agents

Tracks [#31](https://github.com/szhygulin/vaultpilot-dev-framework/issues/31).

## Context

PR #27 / #26 added `split` — overloaded specialists fan out into child agents. The symmetric direction is unaddressed: two specialists drift into overlapping niches, or an agent stops getting picked. Without a cleanup path the roster only grows. Each extra agent adds prompt-seeding cost, summarizer cost, and routing ambiguity at every tick.

Mirror split's UX: detect → emit proposal → human gate → apply.

## Approach

### Phase 1: detection (this PR)

New module `src/agent/prune.ts` exposing:

```ts
export type PruneProposal =
  | { kind: "merge"; survivor: string; absorbed: string; similarity: number; rationale: string }
  | { kind: "retire"; agentId: string; reason: "stale" | "low-merge-rate"; metric: number };

export async function detectPruneCandidates(opts: {
  registry: AgentRegistry;
  outcomes?: AgentOutcomes;
}): Promise<PruneProposal[]>;
```

**Merge detection** — cosine similarity on tag vectors built from `AgentRecord.tags` (jaccard over tag sets is already in `src/orchestrator/routing.ts`'s `jaccard()`; reuse it). Threshold ≥ 0.75 emits a merge proposal. The higher-`issuesHandled` agent is the survivor. Stretch goal (deferred): LLM-judge over both `agents/<id>/CLAUDE.md` files.

**Retire detection** — depends on outcome metrics from #36. If outcomes are absent, retire emits zero proposals (don't guess). With outcomes: agent has no successful run in N days (default 30) AND merge-rate < 0.5 AND `issuesHandled` ≥ 5 (avoid retiring fresh agents).

### Phase 2: apply (this PR)

```ts
export async function applyPruneProposal(p: PruneProposal): Promise<void>;
```

**Merge apply path:**

1. Concat `agents/<survivor>/CLAUDE.md` + `agents/<absorbed>/CLAUDE.md`.
2. Re-run summarizer from `src/agent/summarizer.ts` against the concat (special prompt: "deduplicate; keep most-relevant lessons; ≤200 lines").
3. Move `agents/<absorbed>/` → `agents/.archive/<absorbed>-merged-into-<survivor>-<ts>/`.
4. Update `state/registry.json` via `mutateRegistry()` from `src/state/registry.ts`: mark absorbed agent `archived: true`, append `mergedInto: <survivor>` field on its record.

**Retire apply path:**

1. Move `agents/<id>/` → `agents/.archive/<id>-retired-<ts>/`.
2. `mutateRegistry()` to set `archived: true`, `retiredAt: <iso>`, `retireReason: <reason>`.

### CLI

New subcommand in `src/cli.ts`:

```
vp-dev agents prune              # show pending proposals (read-only)
vp-dev agents prune --apply      # interactive y/N per proposal, then apply
vp-dev agents prune --yes        # apply all without prompt (CI only)
```

### Tick-time integration (deferred)

Auto-fire detection at the end of each `runOrchestrator()` tick with a flag (`VP_DEV_AUTO_PRUNE=1`) — emit proposals only, never apply. Out of scope for this PR; landing detection + manual CLI first.

## Critical files & integration points

- `src/agent/split.ts` — UX template (detect → proposal → apply). Read this first; mirror its shape.
- `src/agent/specialization.ts` — agent tag/specialty model.
- `src/orchestrator/routing.ts` — `jaccard()` reusable for merge similarity.
- `src/agent/summarizer.ts` — `summarize()` called for the merged CLAUDE.md.
- `src/state/registry.ts` — `mutateRegistry()` for atomic registry updates; `AgentRecord` shape includes `archived?: boolean`.
- `src/cli.ts` — new `prune` subcommand under the existing `agents` group.
- `src/types.ts` — extend `AgentRecord` with optional `mergedInto`, `retiredAt`, `retireReason` fields.

## Verification

- Unit test `detectPruneCandidates()` against a fixture registry with two near-identical agents → emits exactly one merge proposal with the higher-`issuesHandled` agent as survivor.
- Unit test against a fixture with one stale low-merge-rate agent (outcomes provided) → emits one retire proposal.
- Integration test: `vp-dev agents prune --apply --yes` against a temp `state/` + `agents/` fixture → archive directory exists, registry updated, original agent dirs removed.
- `vp-dev agents prune` (read-only) prints proposals without modifying anything; assert idempotency via `git diff` on state files.

## Out of scope

- Rebalancing in-flight work — prune runs between dispatch ticks only.
- Auto-apply without human gate (even at high similarity).
- Cross-target-repo merging.
- LLM-judge similarity scoring.
- Tick-time auto-fire (separate follow-up).
