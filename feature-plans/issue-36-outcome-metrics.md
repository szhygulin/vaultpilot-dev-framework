# Plan: outcome metrics — merge rate, rework cycles, cost-per-merge per agent

Tracks [#36](https://github.com/szhygulin/vaultpilot-dev-framework/issues/36).

## Context

The orchestrator has no feedback loop from "did this PR actually land cleanly." CI green is the only quality signal — and CI green ≠ issue resolved. A run that opened a PR which got closed-unmerged, or required 5 reviewer-rework cycles, looks identical to a clean one-shot success. This blocks #31 (merge/retire decisions need merge-rate), #34 (cost-ceiling defaults need cost-per-merge), and #35 (triage rubric tuning needs ground truth).

## Approach

### Storage

`state/outcomes/<agent-id>.jsonl` — append-only JSONL, gitignored under `state/`. One line per terminal PR outcome:

```jsonc
{
  "agent": "agent-90e4",
  "issue": 162,
  "pr": 446,
  "terminalState": "merged",        // merged | closed-unmerged | stalled
  "ciCycles": 2,                    // count of CI re-runs before final state
  "reviewerRoundtrips": 1,          // changes_requested → push cycles
  "daysOpen": 3,
  "costUsd": null,                  // populated once #34 lands
  "closedAt": "2026-05-12T14:22:00Z"
}
```

### Polling — lazy, on each `vp-dev` invocation

New file `src/state/outcomes.ts`:

```ts
export type Outcome = { /* matches schema above */ };

export async function pollOutcomes(opts: {
  registry: AgentRegistry;
  staleThresholdDays: number;
}): Promise<Outcome[]>;

export function appendOutcome(agentId: string, outcome: Outcome): Promise<void>;
```

Logic:
1. For each `AgentRecord` in registry, walk recent runs (from `runState` history files).
2. For any PR not yet in `state/outcomes/<agent>.jsonl`, fetch its current GitHub state via `gh pr view <N> --json state,mergedAt,closedAt,reviews,statusCheckRollup`.
3. If terminal (merged or closed): compute counters and append.
4. If non-terminal but `daysOpen > staleThreshold`: mark `stalled`, append, stop polling for this PR.

### Counter computation

- **`ciCycles`** — count of `statusCheckRollup` entries with `conclusion === "FAILURE"` before the final state. Approximation: count of failed runs in the rollup history.
- **`reviewerRoundtrips`** — count `reviews[].state === "CHANGES_REQUESTED"` events (each one implies a subsequent push to address).
- **`daysOpen`** — `closedAt - createdAt` in days.

These are approximations; refinement is a follow-up if signal is noisy.

### Polling cadence

In `src/cli.ts`'s `cmdRun()`, before `buildSetupPreview()`:

```ts
await pollOutcomes({ registry, staleThresholdDays: opts.stalledThresholdDays ?? 14 });
```

Cheap (one `gh pr view` per non-terminal PR in registry). Lazy — runs only when the user invokes `vp-dev`.

### Stalled threshold

`--stalled-threshold-days <N>` flag in `src/cli.ts`, default 14.

### Rollup CLI

New `vp-dev agents stats` subcommand in `src/cli.ts`:

```
$ vp-dev agents stats
agent-90e4   solana-staking      runs:12  merge-rate:83%  median-rework:1  $/merge:$0.51
agent-d396   evm-lending         runs:8   merge-rate:62%  median-rework:3  $/merge:$1.20
agent-51e5   curve-pools         runs:3   merge-rate:33%  median-rework:4  $/merge:$2.10
```

Reads all `state/outcomes/<agent>.jsonl` files; computes per-agent rollup. Sort by merge-rate desc by default; flag for sort-by alternatives.

### Cost integration

`costUsd` is `null` until #34 lands. Once #34 lands, the run's `RunCostTracker` final total is split per-issue (proportional to issue's share of total tokens, simplest model) and stamped at outcome-append time.

## Critical files & integration points

- `src/state/outcomes.ts` — new module: `Outcome` type, `pollOutcomes`, `appendOutcome`.
- `src/state/registry.ts` — outcome polling reads agent records here.
- `src/state/runState.ts` — outcome polling reads PR numbers from completed run histories.
- `src/github/gh.ts` — `gh pr view` wrapper; may need a new helper `prState(repo, prNumber)` if not already exposed.
- `src/cli.ts` — `cmdRun()` invokes `pollOutcomes()` early; new `vp-dev agents stats` subcommand.
- `state/outcomes/` — new gitignored directory.

## Verification

- Unit test: a PR fixture in state `merged` with 2 failed-then-passing CI runs and 1 changes_requested review → outcome record has `ciCycles: 2`, `reviewerRoundtrips: 1`, `terminalState: "merged"`.
- Integration test: run `pollOutcomes` on a registry pointing at a real (or recorded) PR; assert JSONL append, idempotency on re-run.
- Integration test: simulate a 14+ days-open PR with no activity → `terminalState: "stalled"`, no further polling.
- `vp-dev agents stats` against a fixture with two agents → correct rollup, correct sort order.

## Out of scope

- Cross-agent leaderboards / rankings.
- Cross-target-repo aggregation.
- Trend graphs / dashboards (JSONL is enough; users can `jq` it).
- Refining counter heuristics with reviewer-comment NLP — defer until rollup signal proves it matters.
- Per-issue cost split via token-share heuristic until #34 lands.
