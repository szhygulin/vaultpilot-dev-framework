import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ allowPairClusters: true }) === PAIR_CLUSTER_FLOOR", () => {
  assert.equal(resolveMinClusterSize({ allowPairClusters: true }), PAIR_CLUSTER_FLOOR);
});
