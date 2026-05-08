import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ allowPairClusters: true }) returns PAIR_CLUSTER_FLOOR", () => {
  const result = resolveMinClusterSize({ allowPairClusters: true } as any);
  assert.equal(result, PAIR_CLUSTER_FLOOR);
  assert.equal(result, 2);
});
