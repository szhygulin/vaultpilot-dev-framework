import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: recent citation outperforms 30-day-old citation", () => {
  const base = { reinforcement: 0, pushback: 0, incidents: 0, crossRefCentrality: 0 };
  const recent = composeUtility({ ...base, lastCitedDaysAgo: 0 } as any);
  const old = composeUtility({ ...base, lastCitedDaysAgo: 30 } as any);
  assert.ok(recent > old, `expected recent=${recent} > old(30d)=${old}`);
});
