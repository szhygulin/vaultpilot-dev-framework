import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: success-metric — ref=0, incidents=0, pushback=0 reliably drops", () => {
  // Try a few section sizes; all should drop given zero utility.
  for (const bytes of [200, 1500, 8000]) {
    const v = verdict(
      { id: `s-${bytes}`, bytes } as any,
      { reinforcement: 0, pushback: 0, incidents: 0, lastCitedDaysAgo: 120, crossRefCentrality: 0 } as any,
      1.0,
    );
    assert.equal(v, "drop", `bytes=${bytes} should drop, got ${v}`);
  }
});
