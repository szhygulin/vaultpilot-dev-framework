# Plan: hard cost ceiling per run with graceful abort

Tracks [#34](https://github.com/szhygulin/vaultpilot-dev-framework/issues/34).

## Context

The approval gate surfaces a projected cost (`agent count × issue range × model tier`) per CLAUDE.md's "MUST surface the planned cost" rule. There is no enforcement — a coding agent that loops on a degenerate prompt, retries hard, or hits a tool-use storm can blow past the estimate before the user notices. The gate is a pre-flight check; this is the in-flight backstop.

## Approach

### Pricing module

New file `src/agent/pricing.ts`:

```ts
type ModelId = "claude-opus-4-7" | "claude-sonnet-4-6" | "claude-haiku-4-5-20251001";

const PRICE_PER_MTOK: Record<ModelId, { input: number; cachedInput: number; output: number }> = {
  // Hardcoded as of <date>; refresh when Anthropic prices change.
  // TODO: source: https://www.anthropic.com/pricing
};

export function costForUsage(model: ModelId, usage: AnthropicUsage): number;
```

`AnthropicUsage` is the `usage` field shape from the SDK response (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`).

### Tracking — three call sites today

Per the exploration, `query()` is invoked from:

1. `src/agent/codingAgent.ts` — coding agent execution (largest cost driver).
2. `src/orchestrator/dispatcher.ts` — LLM-driven assignment.
3. `src/agent/split.ts` — split detection/proposal.

(After other PRs land, add: `src/agent/summarizer.ts` for failure path, `src/orchestrator/triage.ts`, `src/agent/planner.ts`. Each gets the same shape.)

Each call site reads `usage` off every response message and forwards `(model, usage)` to a singleton tracker:

```ts
// src/agent/costTracker.ts (new)
class RunCostTracker {
  private total = 0;
  add(model: ModelId, usage: AnthropicUsage): void;
  total(): number;
  exceedsBudget(budgetUsd: number): boolean;
}
```

The tracker is run-scoped — instantiated once in `cmdRun()` (`src/cli.ts`), passed through to the orchestrator and child queries via dependency injection (or a module-level singleton tied to `RunState.runId` if DI is too invasive).

### Flags

In `src/cli.ts`:

```
--max-cost-usd <N>    # hard ceiling, default unset
```

Env var `VP_DEV_MAX_COST_USD` as fallback. When unset, no enforcement (opt-in for v1).

### Enforcement — in `runOrchestrator()`

After each `Promise.race(inFlight.values())` resolution (`src/orchestrator/orchestrator.ts` line 114):

```ts
if (budgetUsd !== undefined && tracker.total() > budgetUsd) {
  logger.warn(`Budget ceiling exceeded: $${tracker.total().toFixed(2)} > $${budgetUsd}.`);
  // Stop dispatching new — let in-flight finish naturally.
  break;
}
```

In-flight tool calls are NOT killed — graceful abort means the current `query()` resolves on its own; only NEW dispatches stop.

### New terminal state — `aborted-budget`

Extend `IssueStatus` in `src/types.ts`:

```ts
export type IssueStatus = "pending" | "in-flight" | "done" | "failed" | "aborted-budget";
```

When the budget is exceeded mid-run, any issue still in `pending` at break-time is marked `aborted-budget` (new helper `markAborted()` in `src/state/runState.ts`, parallel to `markFailed()`).

Issues already `in-flight` finish their run; their terminal state depends on the run's outcome (succeeded → `done`, failed → `failed`).

### Skip summarizer write on `aborted-budget`

In `src/agent/runIssueCore.ts` post-processing (lines 84–125), guard the summarizer call:

```ts
if (terminalState !== "aborted-budget") {
  await summarize({ ... });
}
```

Aborted runs MUST NOT update `agents/<id>/CLAUDE.md` — incomplete signal would mislead the next run.

## Critical files & integration points

- `src/agent/pricing.ts` — new, hardcoded price table.
- `src/agent/costTracker.ts` — new, per-run accumulator.
- `src/agent/codingAgent.ts` — read `usage`, forward to tracker.
- `src/orchestrator/dispatcher.ts` — same.
- `src/agent/split.ts` — same.
- `src/orchestrator/orchestrator.ts` — `runOrchestrator()` checks budget after each tick race; sets break flag.
- `src/state/runState.ts` — new `markAborted()`; extend `IssueStatus`.
- `src/agent/runIssueCore.ts` — guard summarizer call on terminal state.
- `src/cli.ts` — `--max-cost-usd` flag, env var fallback, tracker instantiation.
- `src/types.ts` — extend `IssueStatus`.

## Verification

- Unit test `costForUsage()` against canonical usage objects → returns the right $ for each model.
- Integration test: set `--max-cost-usd 0.10` against a 5-issue run; confirm exactly the in-flight issue at break-time finishes, remaining `pending` issues marked `aborted-budget`.
- Confirm `agents/<id>/CLAUDE.md` is unchanged for any agent whose latest run was `aborted-budget`.
- Confirm the run's final state log shows the total cost and the abort threshold.

## Out of scope

- Time-based timeouts (orthogonal).
- Per-tool-call caps (too granular).
- Cost forecasting from past runs — depends on #36.
- Per-agent ceilings (per-run subsumes for v1).
- Hard-killing in-flight `query()` — graceful abort only.
- Auto-default ceiling — opt-in for v1; defaulting on invites surprise aborts.
