// Catches signature drift: e.g. a refactor that turns verdict() into a single-object-arg function
// without updating the contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: dropping the contextCostFactor arg either throws or yields a valid enum, not undefined", () => {
  let threw = false;
  let result: unknown;
  try {
    // intentionally call with two args to provoke the missing-arg path
    result = (verdict as any)({ bytes: 1024 }, {});
  } catch {
    threw = true;
  }
  if (!threw) {
    assert.ok(
      result === "keep" || result === "trim" || result === "drop",
      `expected enum or throw on missing third arg; got ${JSON.stringify(result)}`,
    );
  }
});
