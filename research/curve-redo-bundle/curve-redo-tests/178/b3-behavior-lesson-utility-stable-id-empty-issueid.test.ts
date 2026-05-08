// Negative: an empty issueId must not silently collide with a populated one.
// Implementation may legitimately throw on empty input OR hash it; either is
// 'loud', but a silent collision is not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: empty issueId distinct from populated issueId", () => {
  let empty: string | undefined;
  try {
    empty = deriveStableId("run-A", "");
  } catch {
    // Rejecting empty input is also a valid loud failure.
    return;
  }
  const populated = deriveStableId("run-A", "issue:#100");
  assert.notEqual(empty, populated);
});
