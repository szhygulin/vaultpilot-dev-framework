// Negative: a pass-through must not leak the issueId.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: output does not include issueId verbatim", () => {
  const id = deriveStableId("run-A", "issue:#7777");
  assert.equal(id.includes("issue"), false);
  assert.equal(id.includes("7777"), false);
  assert.equal(id.includes("#"), false);
});
