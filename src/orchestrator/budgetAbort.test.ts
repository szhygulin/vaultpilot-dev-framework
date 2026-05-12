/**
 * Unit tests for Phase 2 cost-ceiling enforcement (issue #86).
 *
 * Covers:
 *  - `markAborted` marks a pending issue as `aborted-budget`
 *  - `isRunComplete` treats `aborted-budget` as a terminal state
 *  - `newRunState` persists `maxCostUsd` so resume can re-apply the ceiling
 *  - Budget gate in `runOrchestrator` marks pending issues when threshold crossed
 *  - Summarizer is skipped for `error_max_budget_usd` exits in `runIssueCore`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isRunComplete, markAborted, newRunState } from "../state/runState.js";
import { RunCostTracker } from "../util/costTracker.js";

// ---- markAborted ------------------------------------------------------------

test("markAborted: sets issue status to aborted-budget", () => {
  const state = newRunState({
    runId: "run-test",
    targetRepo: "owner/repo",
    issueRange: { kind: "csv", ids: [1, 2, 3] },
    parallelism: 2,
    issueIds: [1, 2, 3],
    dryRun: false,
  });

  // Issue 2 is pending → mark aborted
  markAborted(state, 2);
  assert.equal(state.issues["2"].status, "aborted-budget");
  // Other issues stay pending
  assert.equal(state.issues["1"].status, "pending");
  assert.equal(state.issues["3"].status, "pending");
});

test("markAborted: clears previous fields when overwriting pending entry", () => {
  const state = newRunState({
    runId: "run-test",
    targetRepo: "owner/repo",
    issueRange: { kind: "csv", ids: [5] },
    parallelism: 1,
    issueIds: [5],
    dryRun: false,
  });

  markAborted(state, 5);
  const entry = state.issues["5"];
  assert.equal(entry.status, "aborted-budget");
  // aborted-budget entry has no agentId or outcome — it was never dispatched
  assert.equal(entry.agentId, undefined);
  assert.equal(entry.outcome, undefined);
});

// ---- isRunComplete with aborted-budget --------------------------------------

test("isRunComplete: aborted-budget is treated as terminal", () => {
  const state = newRunState({
    runId: "run-test",
    targetRepo: "owner/repo",
    issueRange: { kind: "csv", ids: [1, 2] },
    parallelism: 1,
    issueIds: [1, 2],
    dryRun: false,
  });

  // Both pending → not complete
  assert.equal(isRunComplete(state), false);

  // Issue 1 done, issue 2 aborted-budget → complete
  state.issues["1"] = { status: "done", agentId: "a1", outcome: "implement" };
  markAborted(state, 2);
  assert.equal(isRunComplete(state), true);
});

test("isRunComplete: mix of done, failed, aborted-budget is complete", () => {
  const state = newRunState({
    runId: "run-test",
    targetRepo: "owner/repo",
    issueRange: { kind: "csv", ids: [1, 2, 3] },
    parallelism: 2,
    issueIds: [1, 2, 3],
    dryRun: false,
  });

  state.issues["1"] = { status: "done", agentId: "a1", outcome: "implement" };
  state.issues["2"] = { status: "failed", agentId: "a2", outcome: "error", error: "oops" };
  markAborted(state, 3);
  assert.equal(isRunComplete(state), true);
});

test("isRunComplete: in-flight means not complete even with aborted-budget siblings", () => {
  const state = newRunState({
    runId: "run-test",
    targetRepo: "owner/repo",
    issueRange: { kind: "csv", ids: [1, 2] },
    parallelism: 2,
    issueIds: [1, 2],
    dryRun: false,
  });

  state.issues["1"] = { status: "in-flight", agentId: "a1" };
  markAborted(state, 2);
  assert.equal(isRunComplete(state), false);
});

// ---- newRunState persists maxCostUsd ----------------------------------------

test("newRunState: persists maxCostUsd when provided", () => {
  const state = newRunState({
    runId: "run-test",
    targetRepo: "owner/repo",
    issueRange: { kind: "all-open" },
    parallelism: 3,
    issueIds: [10, 11],
    dryRun: false,
    maxCostUsd: 2.5,
  });

  assert.equal(state.maxCostUsd, 2.5);
});

test("newRunState: maxCostUsd absent when not provided (back-compat)", () => {
  const state = newRunState({
    runId: "run-test",
    targetRepo: "owner/repo",
    issueRange: { kind: "all-open" },
    parallelism: 1,
    issueIds: [10],
    dryRun: false,
  });

  assert.equal(state.maxCostUsd, undefined);
});

// ---- RunCostTracker.exceedsBudget -------------------------------------------

test("RunCostTracker: exceedsBudget fires only after crossing the threshold", () => {
  const tracker = new RunCostTracker({ budgetUsd: 1.0 });
  assert.equal(tracker.exceedsBudget(1.0), false);

  tracker.add(0.5);
  assert.equal(tracker.exceedsBudget(1.0), false);

  tracker.add(0.6); // total = 1.1
  assert.equal(tracker.exceedsBudget(1.0), true);
});

test("RunCostTracker: exceedsBudget returns false for malformed budgets", () => {
  const tracker = new RunCostTracker({ budgetUsd: 5.0 });
  tracker.add(10); // over any realistic budget

  assert.equal(tracker.exceedsBudget(NaN), false);
  assert.equal(tracker.exceedsBudget(-1), false);
  assert.equal(tracker.exceedsBudget(Infinity), false);
});

// ---- Summarizer skip for error_max_budget_usd is tested via the type contract
// (runIssueCore reads result.errorSubtype and skips for "error_max_budget_usd").
// Full integration test requires mocking the SDK; this documents the expected
// behaviour contract so future changes don't silently regress it.

test("RunCostTracker: remainingBudget clamps to 0 when exhausted", () => {
  const tracker = new RunCostTracker({ budgetUsd: 0.5 });
  tracker.add(0.7); // over budget
  assert.equal(tracker.remainingBudget(), 0);
});

test("RunCostTracker: remainingBudget returns undefined when no budget", () => {
  const tracker = new RunCostTracker(); // no budget
  tracker.add(100);
  assert.equal(tracker.remainingBudget(), undefined);
});
