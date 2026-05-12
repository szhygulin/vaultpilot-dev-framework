// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRunComplete, markAborted, newRunState, pendingIssueIds } from "../state/runState.js";

test("b6 isruncomplete inflight blocks", () => {
  const s = newRunState({ runId: "r", targetRepo: "x/y", issueRange: { kind: "csv", ids: [1,2] }, parallelism: 1, issueIds: [1,2], dryRun: true });
  s.issues["1"] = { status: "in-flight", agentId: "a" };
  markAborted(s, 2);
  assert.equal(isRunComplete(s), false);
});
