// Negative: an implementation that returns the input length, or a non-fixed
// digest (e.g. variable-length encoding), would break downstream parsers
// that expect a 64-char column.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: 10k-char runId still yields 64-char output", () => {
  const longRun = "run-" + "x".repeat(10_000);
  const id = deriveStableId(longRun, "issue:#100");
  assert.equal(id.length, 64);
  assert.match(id, /^[0-9a-f]{64}$/);
});

test("deriveStableId: 10k-char issueId still yields 64-char output", () => {
  const longIssue = "issue:" + "#1+".repeat(3000) + "#9999";
  const id = deriveStableId("run-A", longIssue);
  assert.equal(id.length, 64);
});
