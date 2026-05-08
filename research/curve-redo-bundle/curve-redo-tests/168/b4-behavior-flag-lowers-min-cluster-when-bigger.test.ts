import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 5, allowPairClusters: true }): flag drops floor to 2", () => {
  assert.equal(
    resolveMinClusterSize({ minClusterSize: 5, allowPairClusters: true }),
    PAIR_CLUSTER_FLOOR,
  );
});
