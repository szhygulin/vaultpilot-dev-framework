import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: past-incident density strictly increases utility", () => {
  const base = { reinforcement: 0, pushback: 0, lastCitedDaysAgo: 9999, crossRefCentrality: 0 };
  const low = composeUtility({ ...base, incidents: 0 } as any);
  const high = composeUtility({ ...base, incidents: 20 } as any);
  assert.ok(high > low, `expected utility(incidents=20)=${high} > utility(incidents=0)=${low}`);
});
