// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRunComplete, markAborted, newRunState, pendingIssueIds } from "../state/runState.js";

test("b6 pending excludes done", () => {
  const s = newRunState({ runId: "r", targetRepo: "x/y", issueRange: { kind: "csv", ids: [1,2] }, parallelism: 1, issueIds: [1,2], dryRun: true });
  s.issues["1"] = { status: "done", agentId: "a", outcome: "implement" };
  assert.deepEqual(pendingIssueIds(s), [2]);
});
