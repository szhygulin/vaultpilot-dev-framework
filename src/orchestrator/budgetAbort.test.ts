import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRunComplete,
  markAborted,
  newRunState,
  pendingIssueIds,
} from "../state/runState.js";

// #86 Phase 2: per-run cost ceiling enforcement. The state-layer half is a
// new terminal status (`aborted-budget`) plus a `markAborted` helper that
// flips pending issues into it. Together they let `runOrchestrator` exit
// cleanly after the budget gate fires without polluting the existing
// `failed` bucket (which is reserved for coding-agent crashes).
//
// Tests live in `src/orchestrator/` because the test glob in package.json
// covers `dist/src/orchestrator/*.test.js`. Adding them in `src/state/`
// would require a glob update.

function makeState(issueIds: number[]): ReturnType<typeof newRunState> {
  return newRunState({
    runId: "run-test",
    targetRepo: "x/y",
    issueRange: { kind: "csv", ids: issueIds },
    parallelism: 1,
    issueIds,
    dryRun: true,
  });
}

test("markAborted: flips pending → aborted-budget with descriptive error", () => {
  const state = makeState([1, 2, 3]);
  markAborted(state, 2);
  assert.equal(state.issues["2"].status, "aborted-budget");
  assert.equal(state.issues["2"].outcome, "error");
  assert.match(state.issues["2"].error ?? "", /per-run cost ceiling/);
  // Other issues untouched.
  assert.equal(state.issues["1"].status, "pending");
  assert.equal(state.issues["3"].status, "pending");
});

test("markAborted: idempotent on already-terminal issues", () => {
  const state = makeState([1]);
  state.issues["1"] = {
    status: "done",
    agentId: "agent-1",
    outcome: "implement",
    prUrl: "https://example.com/pr/1",
  };
  markAborted(state, 1);
  // Done stays done — operator policy abort never overwrites a successful PR.
  assert.equal(state.issues["1"].status, "done");
  assert.equal(state.issues["1"].prUrl, "https://example.com/pr/1");
});

test("markAborted: idempotent on already-failed issues", () => {
  const state = makeState([1]);
  state.issues["1"] = {
    status: "failed",
    agentId: "agent-1",
    outcome: "error",
    error: "error_max_turns",
  };
  markAborted(state, 1);
  // Failed stays failed — distinct cause from cost-abort, must not be
  // collapsed into the same bucket.
  assert.equal(state.issues["1"].status, "failed");
  assert.equal(state.issues["1"].error, "error_max_turns");
});

test("markAborted: idempotent on already-aborted-budget", () => {
  const state = makeState([1]);
  markAborted(state, 1);
  const first = state.issues["1"];
  markAborted(state, 1);
  // Same shape — no double-write of the error string.
  assert.deepEqual(state.issues["1"], first);
});

test("markAborted: no-op when issue is missing from state", () => {
  const state = makeState([1]);
  markAborted(state, 999);
  assert.equal(Object.keys(state.issues).length, 1);
});

test("isRunComplete: aborted-budget counts as terminal", () => {
  const state = makeState([1, 2, 3]);
  // Mark one done, one failed, one aborted-budget — all terminal.
  state.issues["1"] = { status: "done", agentId: "a", outcome: "implement" };
  state.issues["2"] = { status: "failed", agentId: "a", outcome: "error" };
  markAborted(state, 3);
  assert.equal(isRunComplete(state), true);
});

test("isRunComplete: pending or in-flight blocks completion", () => {
  const state = makeState([1, 2]);
  state.issues["1"] = { status: "done", agentId: "a", outcome: "implement" };
  // 2 still pending → not complete.
  assert.equal(isRunComplete(state), false);
  state.issues["2"] = { status: "in-flight", agentId: "a" };
  assert.equal(isRunComplete(state), false);
});

test("pendingIssueIds: aborted-budget excluded from pending list", () => {
  const state = makeState([1, 2, 3]);
  markAborted(state, 2);
  // Only #1 and #3 remain pending — #2 is terminal even though it never ran.
  // This is the property `runOrchestrator` relies on to stop dispatching
  // once the budget gate has fired (next tick's `pendingIssueIds()` is
  // shorter, the dispatch loop's cap goes to 0).
  const remaining = pendingIssueIds(state).sort();
  assert.deepEqual(remaining, [1, 3]);
});

test("newRunState: persists maxCostUsd when provided", () => {
  const s = newRunState({
    runId: "r",
    targetRepo: "x/y",
    issueRange: { kind: "csv", ids: [1] },
    parallelism: 1,
    issueIds: [1],
    dryRun: false,
    maxCostUsd: 5.5,
  });
  assert.equal(s.maxCostUsd, 5.5);
});

test("newRunState: omits maxCostUsd when undefined (back-compat)", () => {
  const s = newRunState({
    runId: "r",
    targetRepo: "x/y",
    issueRange: { kind: "csv", ids: [1] },
    parallelism: 1,
    issueIds: [1],
    dryRun: false,
  });
  // Field absent rather than `null`; consumers can use the same `undefined`
  // check pre- and post-#86 without an explicit migration.
  assert.equal(s.maxCostUsd, undefined);
  assert.equal("maxCostUsd" in s, false);
});
