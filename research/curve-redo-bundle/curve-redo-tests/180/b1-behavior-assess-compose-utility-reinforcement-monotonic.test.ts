import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: reinforcement frequency strictly increases utility", () => {
  const base = { pushback: 0, incidents: 0, lastCitedDaysAgo: 9999, crossRefCentrality: 0 };
  const low = composeUtility({ ...base, reinforcement: 0 } as any);
  const high = composeUtility({ ...base, reinforcement: 20 } as any);
  assert.ok(high > low, `expected utility(reinforcement=20)=${high} > utility(reinforcement=0)=${low}`);
});
