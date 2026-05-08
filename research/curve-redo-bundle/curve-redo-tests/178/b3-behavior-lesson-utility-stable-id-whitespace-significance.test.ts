// Negative: silent trimming hides bugs in upstream sentinel parsing.
// The id-stability section is load-bearing — exact byte equality matters.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: trailing space in runId changes the hash", () => {
  const clean = deriveStableId("run-A", "issue:#100");
  const trailing = deriveStableId("run-A ", "issue:#100");
  assert.notEqual(clean, trailing);
});

test("deriveStableId: leading space in issueId changes the hash", () => {
  const clean = deriveStableId("run-A", "issue:#100");
  const leading = deriveStableId("run-A", " issue:#100");
  assert.notEqual(clean, leading);
});
