import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("missing utility record returns 'keep' even at very large bytes", () => {
  // The fallback for sections with no utility signal yet is 'keep' —
  // bytes shouldn't override that decision.
  const result = verdict(
    { bytes: 5_000_000 } as any,
    undefined as any,
    10.0,
  );
  assert.equal(result, "keep");
});
