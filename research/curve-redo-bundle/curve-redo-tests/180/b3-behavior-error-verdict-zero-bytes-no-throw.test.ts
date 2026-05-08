// Even degenerate inputs (zero-byte section) must produce a valid enum verdict, not crash.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: zero-byte section does not throw and returns valid enum", () => {
  let result: unknown;
  assert.doesNotThrow(() => {
    result = verdict({ bytes: 0 } as any, {} as any, 1.0);
  });
  assert.ok(
    result === "keep" || result === "trim" || result === "drop",
    `expected enum verdict, got ${JSON.stringify(result)}`,
  );
});
