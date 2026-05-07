// Negative: an implementation that uses MD5 (32) or SHA-1 (40) silently
// fails the documented sha256 contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: returns string of length exactly 64", () => {
  const id = deriveStableId("run-A", "issue:#100");
  assert.equal(typeof id, "string");
  assert.equal(id.length, 64);
});
