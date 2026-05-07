// Cost factor is multiplicative against bytes; negative values are nonsense but must not produce
// invalid enum values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: negative contextCostFactor either throws or yields a valid enum", () => {
  let threw = false;
  let result: unknown;
  try {
    result = verdict({ bytes: 1024 } as any, {} as any, -2.5);
  } catch {
    threw = true;
  }
  if (!threw) {
    assert.ok(
      result === "keep" || result === "trim" || result === "drop",
      `permissive impl returned non-enum: ${JSON.stringify(result)}`,
    );
  }
});
