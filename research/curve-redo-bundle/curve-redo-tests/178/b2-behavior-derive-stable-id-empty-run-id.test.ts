// Edge case: empty input — empty runId is unusual but must not crash;
// the function should still produce a 64-char hex digest (sha256 of
// `':' + issueId`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: empty runId still yields valid 64-char hex", () => {
  const id = deriveStableId("", "#100");
  assert.match(id, /^[0-9a-f]{64}$/);
});
