import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: reinforcement weight strictly exceeds recency weight", () => {
  // Saturate one signal at a time and compare.
  const onlyReinforcement = composeUtility({
    reinforcement: 1000, pushback: 0, incidents: 0, lastCitedDaysAgo: 9999, crossRefCentrality: 0,
  } as any);
  const onlyRecency = composeUtility({
    reinforcement: 0, pushback: 0, incidents: 0, lastCitedDaysAgo: 0, crossRefCentrality: 0,
  } as any);
  assert.ok(
    onlyReinforcement > onlyRecency,
    `reinforcement saturated (${onlyReinforcement}) should outweigh recency saturated (${onlyRecency})`,
  );
});
