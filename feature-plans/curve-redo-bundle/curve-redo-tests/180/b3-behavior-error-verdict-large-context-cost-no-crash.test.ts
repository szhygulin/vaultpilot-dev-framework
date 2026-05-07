// 1e15 cost factor must still produce a valid enum, not Infinity-cascade NaN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: huge contextCostFactor yields valid enum", () => {
  let result: unknown;
  assert.doesNotThrow(() => {
    result = verdict({ bytes: 1024 } as any, {} as any, 1e15);
  });
  assert.ok(
    result === "keep" || result === "trim" || result === "drop",
    `unexpected verdict ${JSON.stringify(result)}`,
  );
});
