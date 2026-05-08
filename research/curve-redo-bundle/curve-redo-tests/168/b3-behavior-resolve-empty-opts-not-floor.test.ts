import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({}) does NOT return PAIR_CLUSTER_FLOOR (would silently weaken default)", () => {
  const result = resolveMinClusterSize({} as any);
  assert.notEqual(
    result,
    PAIR_CLUSTER_FLOOR,
    "calling without flag must not collapse to the pair floor — that would erase the safety default",
  );
});
