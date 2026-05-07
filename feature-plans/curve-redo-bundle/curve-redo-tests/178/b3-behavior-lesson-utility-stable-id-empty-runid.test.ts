// Negative: an empty runId must not silently collide.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: empty runId distinct from populated runId", () => {
  let empty: string | undefined;
  try {
    empty = deriveStableId("", "issue:#100");
  } catch {
    return;
  }
  const populated = deriveStableId("run-A", "issue:#100");
  assert.notEqual(empty, populated);
});
