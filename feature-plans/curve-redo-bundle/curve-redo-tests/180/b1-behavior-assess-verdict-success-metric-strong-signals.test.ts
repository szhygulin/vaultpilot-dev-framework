import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: success-metric — ref>=3, incidents>=1, recent reliably keeps a small section", () => {
  const v = verdict(
    { id: "s0", bytes: 200 } as any,
    { reinforcement: 14, pushback: 2, incidents: 3, lastCitedDaysAgo: 3, crossRefCentrality: 0.7 } as any,
    0.5,
  );
  assert.equal(v, "keep");
});
