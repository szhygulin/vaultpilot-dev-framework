import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: pushback prevention strictly increases utility", () => {
  const base = { reinforcement: 0, incidents: 0, lastCitedDaysAgo: 9999, crossRefCentrality: 0 };
  const low = composeUtility({ ...base, pushback: 0 } as any);
  const high = composeUtility({ ...base, pushback: 20 } as any);
  assert.ok(high > low, `expected utility(pushback=20)=${high} > utility(pushback=0)=${low}`);
});
