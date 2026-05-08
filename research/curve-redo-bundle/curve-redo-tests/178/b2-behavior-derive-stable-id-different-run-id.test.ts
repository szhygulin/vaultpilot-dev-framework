// Edge case: off-by-one — a one-char change in runId must yield a
// completely different hash, otherwise reinforcement scoring across runs
// would collapse onto the wrong section.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: single-char runId difference yields different hash", () => {
  const a = deriveStableId("run-1", "#100");
  const b = deriveStableId("run-2", "#100");
  assert.notEqual(a, b);
});
