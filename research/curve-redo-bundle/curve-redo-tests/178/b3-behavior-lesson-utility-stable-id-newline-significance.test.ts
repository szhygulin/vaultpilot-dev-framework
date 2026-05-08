// Negative: stripping newlines would let a sentinel like
// runId='run-A\nissue:#100' collide with the legitimate two-arg call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: newline in runId changes the hash", () => {
  const clean = deriveStableId("run-A", "issue:#100");
  const newlined = deriveStableId("run-A\n", "issue:#100");
  assert.notEqual(clean, newlined);
});

test("deriveStableId: newline in issueId changes the hash", () => {
  const clean = deriveStableId("run-A", "issue:#100");
  const newlined = deriveStableId("run-A", "issue:#100\n");
  assert.notEqual(clean, newlined);
});
