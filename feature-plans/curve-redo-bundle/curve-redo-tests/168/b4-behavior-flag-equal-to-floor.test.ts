import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 2, allowPairClusters: true }): returns 2", () => {
  assert.equal(
    resolveMinClusterSize({ minClusterSize: 2, allowPairClusters: true }),
    PAIR_CLUSTER_FLOOR,
  );
});
