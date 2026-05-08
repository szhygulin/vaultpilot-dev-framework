// Negative: an impl that uses split(':') would lose information when runId
// contains a colon and silently collapse distinct inputs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: runId with trailing colon distinct from runId without", () => {
  const a = deriveStableId("run-A", "issue:#100");
  const b = deriveStableId("run-A:", "issue:#100");
  assert.notEqual(a, b);
});

test("deriveStableId: distinct issueIds still distinguished even with colon-ish runId", () => {
  const a = deriveStableId("run-A:", "issue:#100");
  const b = deriveStableId("run-A:", "issue:#101");
  assert.notEqual(a, b);
});
