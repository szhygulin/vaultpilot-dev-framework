// Negative: a buggy impl that caches the last result, or that uses module-
// level mutable state, would produce duplicate IDs across calls.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: 50 distinct sentinels produce 50 distinct stable IDs", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 50; i++) {
    ids.add(deriveStableId(`run-${i}`, `issue:#${i}`));
  }
  assert.equal(ids.size, 50);
});

test("deriveStableId: same runId, 50 distinct issueIds -> 50 distinct IDs", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 50; i++) {
    ids.add(deriveStableId("run-A", `issue:#${i}`));
  }
  assert.equal(ids.size, 50);
});

test("deriveStableId: 50 distinct runIds, same issueId -> 50 distinct IDs", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 50; i++) {
    ids.add(deriveStableId(`run-${i}`, "issue:#100"));
  }
  assert.equal(ids.size, 50);
});
