import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: pushback weight strictly exceeds recency weight", () => {
  const onlyPushback = composeUtility({
    reinforcement: 0, pushback: 1000, incidents: 0, lastCitedDaysAgo: 9999, crossRefCentrality: 0,
  } as any);
  const onlyRecency = composeUtility({
    reinforcement: 0, pushback: 0, incidents: 0, lastCitedDaysAgo: 0, crossRefCentrality: 0,
  } as any);
  assert.ok(
    onlyPushback > onlyRecency,
    `pushback saturated (${onlyPushback}) should outweigh recency saturated (${onlyRecency})`,
  );
});
