import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: recency contribution decays to 0 at >=60 days", () => {
  const base = { reinforcement: 0, pushback: 0, incidents: 0, crossRefCentrality: 0 };
  const at60 = composeUtility({ ...base, lastCitedDaysAgo: 60 } as any);
  const at90 = composeUtility({ ...base, lastCitedDaysAgo: 90 } as any);
  const at365 = composeUtility({ ...base, lastCitedDaysAgo: 365 } as any);
  // All should be at the floor (0) once decayed.
  assert.equal(at60, 0);
  assert.equal(at90, 0);
  assert.equal(at365, 0);
});
