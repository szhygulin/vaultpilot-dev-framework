// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRunComplete, markAborted, newRunState, pendingIssueIds } from "../state/runState.js";

test("b6 isruncomplete mixed terminal", () => {
  const s = newRunState({ runId: "r", targetRepo: "x/y", issueRange: { kind: "csv", ids: [1,2,3] }, parallelism: 1, issueIds: [1,2,3], dryRun: true });
  s.issues["1"] = { status: "done", agentId: "a", outcome: "implement" };
  s.issues["2"] = { status: "failed", agentId: "b", outcome: "error" };
  markAborted(s, 3);
  assert.equal(isRunComplete(s), true);
});
