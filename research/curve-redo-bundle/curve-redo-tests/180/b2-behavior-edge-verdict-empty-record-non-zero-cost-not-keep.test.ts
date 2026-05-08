import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict for an empty record + bytes > 0 + factor > 0 is not 'keep'", () => {
  // The empty-record path is the 'no signal' case; the issue states the
  // missing-record fallback returns keep, but an *explicit* empty record
  // (utility ≈ 0) at non-zero cost should fall into trim or drop.
  const result = verdict({ bytes: 4096 } as any, {} as any, 1.0);
  assert.notEqual(
    result,
    "keep",
    "expected empty-signal record to not be classified as 'keep'",
  );
});
