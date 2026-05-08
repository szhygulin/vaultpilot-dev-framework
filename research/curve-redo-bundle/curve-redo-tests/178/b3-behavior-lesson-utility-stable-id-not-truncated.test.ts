// Negative: an impl that returns id.slice(0, 16) (e.g. for 'shorter URLs')
// drastically increases collision probability in the cross-reference index.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: not 16-char (truncated) output", () => {
  const id = deriveStableId("run-A", "issue:#100");
  assert.notEqual(id.length, 16);
});

test("deriveStableId: not 32-char (md5-like) output", () => {
  const id = deriveStableId("run-A", "issue:#100");
  assert.notEqual(id.length, 32);
});

test("deriveStableId: not 40-char (sha1-like) output", () => {
  const id = deriveStableId("run-A", "issue:#100");
  assert.notEqual(id.length, 40);
});
