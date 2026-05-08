import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: all-zero record yields 0 utility", () => {
  const u = composeUtility({
    reinforcement: 0,
    pushback: 0,
    incidents: 0,
    lastCitedDaysAgo: 9999,
    crossRefCentrality: 0,
  } as any);
  assert.equal(typeof u, "number");
  assert.equal(u, 0);
});
