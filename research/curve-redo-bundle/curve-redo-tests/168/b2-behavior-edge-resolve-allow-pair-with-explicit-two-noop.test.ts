import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: allowPairClusters + explicit minClusterSize=2 stays at 2", () => {
  // Per issue: "sugar for --min-cluster-size 2" — passing both should be idempotent.
  assert.equal(
    resolveMinClusterSize({ allowPairClusters: true, minClusterSize: 2 }),
    PAIR_CLUSTER_FLOOR,
  );
});
