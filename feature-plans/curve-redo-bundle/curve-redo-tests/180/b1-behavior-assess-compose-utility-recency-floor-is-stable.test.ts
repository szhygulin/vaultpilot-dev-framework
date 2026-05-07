import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: post-decay recency does not change with further age", () => {
  const base = { reinforcement: 0, pushback: 0, incidents: 0, crossRefCentrality: 0 };
  const a = composeUtility({ ...base, lastCitedDaysAgo: 100 } as any);
  const b = composeUtility({ ...base, lastCitedDaysAgo: 1000 } as any);
  assert.equal(a, b);
});
