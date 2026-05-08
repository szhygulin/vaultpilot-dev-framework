// Issue spec says: missing-utility-record fallback returns 'keep' for sections with no signal yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: missing (undefined) utility record returns 'keep'", () => {
  const result = verdict({ bytes: 1000 } as any, undefined, 1.0);
  assert.equal(result, "keep");
});

test("verdict: missing utility record returns 'keep' even with very high context cost factor", () => {
  const result = verdict({ bytes: 4096 } as any, undefined, 100);
  assert.equal(
    result,
    "keep",
    "sections with no signal yet must not be aggressively pruned regardless of cost",
  );
});
