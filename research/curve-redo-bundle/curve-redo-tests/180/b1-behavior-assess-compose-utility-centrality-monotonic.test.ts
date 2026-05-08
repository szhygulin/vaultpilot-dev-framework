import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: cross-reference centrality strictly increases utility", () => {
  const base = { reinforcement: 0, pushback: 0, incidents: 0, lastCitedDaysAgo: 9999 };
  const low = composeUtility({ ...base, crossRefCentrality: 0 } as any);
  const high = composeUtility({ ...base, crossRefCentrality: 1 } as any);
  assert.ok(high > low, `expected utility(centrality=1)=${high} > utility(centrality=0)=${low}`);
});
