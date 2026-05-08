import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: combining two signals exceeds single-signal utility", () => {
  const onlyReinforcement = composeUtility({
    reinforcement: 5, pushback: 0, incidents: 0, lastCitedDaysAgo: 9999, crossRefCentrality: 0,
  } as any);
  const reinforcementPlusIncidents = composeUtility({
    reinforcement: 5, pushback: 0, incidents: 5, lastCitedDaysAgo: 9999, crossRefCentrality: 0,
  } as any);
  assert.ok(
    reinforcementPlusIncidents > onlyReinforcement,
    `combined=${reinforcementPlusIncidents} should exceed single=${onlyReinforcement}`,
  );
});
