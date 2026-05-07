// The 'no signal yet -> keep' fallback must be uniform, not threshold-driven.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: undefined record always returns 'keep' across the byte/cost grid", () => {
  for (const bytes of [1, 100, 10_000, 1_000_000]) {
    for (const cost of [0.01, 1, 100, 10_000]) {
      const v = verdict({ bytes } as any, undefined, cost);
      assert.equal(
        v,
        "keep",
        `expected 'keep' for missing-record fallback at bytes=${bytes} cost=${cost}, got ${v}`,
      );
    }
  }
});
