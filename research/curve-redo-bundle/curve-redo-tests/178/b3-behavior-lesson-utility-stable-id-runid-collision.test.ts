// Negative: distinct sentinel runIds MUST NOT collide. If the implementation
// drops or normalizes the runId, reinforcement counts attach to the wrong
// section. Spec: stable ID = sha256(sentinel-runId + ':' + sentinel-issueId).

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: distinct runIds yield distinct stable IDs", () => {
  const a = deriveStableId("run-A", "issue:#100");
  const b = deriveStableId("run-B", "issue:#100");
  assert.notEqual(a, b);
});
