// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRunComplete, markAborted, newRunState, pendingIssueIds } from "../state/runState.js";

test("b6 mark aborted idempotent", () => {
  const s = newRunState({ runId: "r", targetRepo: "x/y", issueRange: { kind: "csv", ids: [1] }, parallelism: 1, issueIds: [1], dryRun: true });
  markAborted(s, 1);
  const first = JSON.parse(JSON.stringify(s.issues["1"]));
  markAborted(s, 1);
  assert.deepEqual(s.issues["1"], first);
});
