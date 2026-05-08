import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: deterministic across repeat calls", () => {
  const record = {
    reinforcement: 5,
    pushback: 1,
    incidents: 2,
    lastCitedDaysAgo: 10,
    crossRefCentrality: 0.4,
  } as any;
  const a = composeUtility(record);
  const b = composeUtility(record);
  const c = composeUtility(record);
  assert.equal(a, b);
  assert.equal(b, c);
});
