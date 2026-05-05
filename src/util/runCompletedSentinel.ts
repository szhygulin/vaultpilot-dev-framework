import type { RunState } from "../types.js";

// Aggregate run-classification used by the terminal sentinel. Distinct from
// `IssueStatus` because the run-level status describes the *whole run*'s
// shape:
//
//   - `done`            — every tracked issue ended in `done`.
//   - `failed`          — every tracked issue ended in `failed` (no `done`,
//                         no `aborted-budget`).
//   - `partial`         — terminal mix of `done` + `failed` with no
//                         budget-aborts.
//   - `aborted-budget`  — at least one issue was `aborted-budget`. Takes
//                         precedence over partial / failed because operator
//                         policy is the load-bearing signal for post-run
//                         audits (see #86).
//   - `incomplete`      — at least one issue is still `pending` or
//                         `in-flight` at sentinel-emission time. Surfaces
//                         when the orchestrator hit `maxTicks` before
//                         `isRunComplete(state)` returned true, when the
//                         orchestrator threw mid-tick, or when the process
//                         is winding down on an unhandled error path.
export type RunStatus =
  | "done"
  | "failed"
  | "partial"
  | "aborted-budget"
  | "incomplete";

export interface RunStatusCounts {
  total: number;
  done: number;
  failed: number;
  abortedBudget: number;
  pending: number;
  inFlight: number;
}

export function countRunStatuses(state: RunState): RunStatusCounts {
  const counts: RunStatusCounts = {
    total: 0,
    done: 0,
    failed: 0,
    abortedBudget: 0,
    pending: 0,
    inFlight: 0,
  };
  for (const e of Object.values(state.issues)) {
    counts.total += 1;
    if (e.status === "done") counts.done += 1;
    else if (e.status === "failed") counts.failed += 1;
    else if (e.status === "aborted-budget") counts.abortedBudget += 1;
    else if (e.status === "pending") counts.pending += 1;
    else if (e.status === "in-flight") counts.inFlight += 1;
  }
  return counts;
}

/**
 * Classify the terminal run shape from its issue counts. Pure — no I/O,
 * suitable for direct unit tests.
 *
 * Precedence rationale:
 *   1. `incomplete` first — if there is *any* non-terminal issue (pending
 *      or in-flight), the run did not wind down naturally and watchers /
 *      audits need that fact surfaced before any "looks like a partial
 *      success" framing. Everything else assumes terminal-only state.
 *   2. `aborted-budget` next — operator-policy halt (see #86). Even when
 *      mixed with done / failed it's the dominant signal: the operator
 *      pulled the plug on cost and that's what should drive any retry
 *      decision.
 *   3. `partial` for terminal mix of done + failed — neither pure-success
 *      nor pure-failure, surfaces the need to inspect per-issue outcome.
 *   4. `done` / `failed` — pure outcomes.
 *   5. `done` is the default for the empty-state case (zero issues), which
 *      shouldn't happen in practice (cmdRun rejects empty dispatch sets
 *      pre-launch) but keeps the function total.
 */
export function classifyRunStatus(state: RunState): RunStatus {
  const c = countRunStatuses(state);
  if (c.pending > 0 || c.inFlight > 0) return "incomplete";
  if (c.abortedBudget > 0) return "aborted-budget";
  if (c.done > 0 && c.failed > 0) return "partial";
  if (c.failed > 0) return "failed";
  return "done";
}

export interface RunCompletedSentinelInput {
  runId: string;
  state: RunState;
  totalCostUsd: number;
  durationMs: number;
}

/**
 * Format the terminal-sentinel line emitted by `cmdRun` / `runResume` as
 * the very last line on stdout. The line shape is intentionally simple
 * key=value pairs separated by single spaces so external watchers can
 * recognize it with a single anchored grep:
 *
 *   ^run\.completed runId=...
 *
 * Watchers (`tail -F | awk '/^run\.completed /{print; exit}'`,
 * Claude Code Monitors, shell `until [ -e marker ]`-style polling, etc.)
 * use this to terminate cleanly when the underlying run finishes — see
 * issue #128 for the original symptom (stranded `tail -F` watchers
 * accumulating across a session).
 *
 * Includes the trailing newline so callers can `process.stdout.write`
 * the result directly without a manual `\n` concat.
 */
export function formatRunCompletedSentinel(
  input: RunCompletedSentinelInput,
): string {
  const counts = countRunStatuses(input.state);
  const status = classifyRunStatus(input.state);
  // 4-decimal fixed precision on the cost matches `RunCostTracker.total()`
  // formatting elsewhere in the CLI (e.g. the aborted-budget banner) and
  // gives external dashboards enough resolution to reconcile against the
  // SDK billing dashboard's per-tenth-cent rows.
  const costStr = Number.isFinite(input.totalCostUsd)
    ? input.totalCostUsd.toFixed(4)
    : "0.0000";
  // Integer ms — matches the existing `durationMs` shape in the structured
  // log file. Watchers that surface a final summary line can format this
  // however they want.
  const durationStr = Math.max(0, Math.trunc(input.durationMs)).toString();
  return [
    "run.completed",
    `runId=${input.runId}`,
    `status=${status}`,
    `total=${counts.total}`,
    `done=${counts.done}`,
    `failed=${counts.failed}`,
    `aborted-budget=${counts.abortedBudget}`,
    `durationMs=${durationStr}`,
    `totalCostUsd=${costStr}`,
  ].join(" ") + "\n";
}
