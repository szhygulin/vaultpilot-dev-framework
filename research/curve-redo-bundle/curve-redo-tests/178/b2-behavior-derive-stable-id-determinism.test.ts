// Edge case: empty/repeat input — calling deriveStableId twice with the
// same arguments must produce identical output. The whole point of a
// content-derived stable ID is determinism across calls.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: same inputs yield identical hash (determinism)", () => {
  const a = deriveStableId("run-abc", "#100");
  const b = deriveStableId("run-abc", "#100");
  assert.equal(a, b);
});
