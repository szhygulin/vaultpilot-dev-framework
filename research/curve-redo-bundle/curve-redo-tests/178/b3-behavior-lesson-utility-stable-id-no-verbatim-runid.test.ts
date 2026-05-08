// Negative: a 'pass-through' implementation that just concatenates the
// inputs (or returns runId+':'+issueId) would leak the inputs in the output
// and break the assumption that stable IDs are opaque hex digests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: output does not include runId verbatim", () => {
  const id = deriveStableId("run-DEADBEEF-XYZ", "issue:#100");
  assert.equal(id.includes("run-"), false);
  assert.equal(id.includes("DEADBEEF"), false);
  assert.equal(id.includes("XYZ"), false);
});
