// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRunComplete, markAborted, newRunState, pendingIssueIds } from "../state/runState.js";

test("b6 mark aborted flips pending", () => {
  const s = newRunState({ runId: "r", targetRepo: "x/y", issueRange: { kind: "csv", ids: [1,2,3] }, parallelism: 1, issueIds: [1,2,3], dryRun: true });
  markAborted(s, 2);
  assert.equal(s.issues["2"].status, "aborted-budget");
});
