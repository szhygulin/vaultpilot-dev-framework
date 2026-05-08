// Edge case: off-by-one — a one-char change in issueId must yield a
// different hash so #100 and #101 don't collide.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: single-char issueId difference yields different hash", () => {
  const a = deriveStableId("run-1", "#100");
  const b = deriveStableId("run-1", "#101");
  assert.notEqual(a, b);
});
