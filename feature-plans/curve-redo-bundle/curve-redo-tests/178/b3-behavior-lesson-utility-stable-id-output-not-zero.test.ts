// Negative: a stub implementation returning a constant (e.g. all zeros, or
// a placeholder string) would silently merge every section's history.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: not all zeros for non-degenerate input", () => {
  const id = deriveStableId("run-A", "issue:#100");
  assert.notEqual(id, "0".repeat(64));
});

test("deriveStableId: not constant across distinct inputs (stub detector)", () => {
  const a = deriveStableId("run-A", "issue:#100");
  const b = deriveStableId("run-Z", "issue:#999");
  const c = deriveStableId("run-Q", "issue:#42");
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(b, c);
});
