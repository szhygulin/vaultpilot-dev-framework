// Negative: lowercasing inputs would silently merge IDs that the run-state
// layer treats as distinct sentinels.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: case-sensitive in runId", () => {
  const a = deriveStableId("run-A", "issue:#100");
  const b = deriveStableId("Run-A", "issue:#100");
  assert.notEqual(a, b);
});

test("deriveStableId: case-sensitive in issueId", () => {
  const a = deriveStableId("run-A", "Issue:#100");
  const b = deriveStableId("run-A", "issue:#100");
  assert.notEqual(a, b);
});
