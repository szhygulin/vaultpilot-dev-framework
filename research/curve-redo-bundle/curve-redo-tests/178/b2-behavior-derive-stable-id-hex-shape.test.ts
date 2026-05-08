// Edge case: max/min size — sha256 hex digest is exactly 64 lowercase
// hex chars. Anything else (uppercase, base64, truncated) breaks downstream
// consumers that treat sectionId as a fixed-width key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: returns exactly 64 lowercase hex chars", () => {
  const id = deriveStableId("run-1", "#100");
  assert.equal(id.length, 64);
  assert.match(id, /^[0-9a-f]{64}$/);
});
