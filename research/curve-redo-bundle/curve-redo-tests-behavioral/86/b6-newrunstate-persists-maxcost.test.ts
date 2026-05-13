// Behavior import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRunComplete, markAborted, newRunState, pendingIssueIds } from "../state/runState.js";

test("b6 newrunstate persists maxcost", () => {
  const s = newRunState({ runId: "r", targetRepo: "x/y", issueRange: { kind: "csv", ids: [1] }, parallelism: 1, issueIds: [1], dryRun: false, maxCostUsd: 5.5 });
  assert.equal(s.maxCostUsd, 5.5);
});
