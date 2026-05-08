import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: saturated signals stay within [0, 1]", () => {
  const u = composeUtility({
    reinforcement: 1000,
    pushback: 1000,
    incidents: 1000,
    lastCitedDaysAgo: 0,
    crossRefCentrality: 1,
  } as any);
  assert.equal(typeof u, "number");
  assert.ok(u >= 0, `expected >= 0, got ${u}`);
  assert.ok(u <= 1, `expected <= 1, got ${u}`);
});
