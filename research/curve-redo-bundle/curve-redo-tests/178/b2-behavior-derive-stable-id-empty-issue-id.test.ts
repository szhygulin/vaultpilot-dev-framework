// Edge case: empty input — empty issueId is unusual but must not crash;
// the function should still produce a 64-char hex digest (sha256 of
// `runId + ':'`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: empty issueId still yields valid 64-char hex", () => {
  const id = deriveStableId("run-1", "");
  assert.match(id, /^[0-9a-f]{64}$/);
});
