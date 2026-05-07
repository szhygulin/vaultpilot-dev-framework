// cost = bytes * factor; if factor is 0 the implementation must still return a valid enum.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: contextCostFactor=0 does not throw and returns a valid enum", () => {
  let result: unknown;
  assert.doesNotThrow(() => {
    result = verdict({ bytes: 1000 } as any, {} as any, 0);
  });
  assert.ok(
    result === "keep" || result === "trim" || result === "drop",
    `expected enum verdict, got ${JSON.stringify(result)}`,
  );
});
