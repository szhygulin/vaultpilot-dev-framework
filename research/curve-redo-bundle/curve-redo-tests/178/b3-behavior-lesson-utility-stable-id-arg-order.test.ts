// Negative: a buggy concatenation order (issueId first) would silently
// break stability across the codebase that calls (runId, issueId).

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: f(a,b) != f(b,a) for non-equal a,b", () => {
  const ab = deriveStableId("run-A", "issue:#100");
  const ba = deriveStableId("issue:#100", "run-A");
  assert.notEqual(ab, ba);
});
