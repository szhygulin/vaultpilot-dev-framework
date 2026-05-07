import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: allowPairClusters=false preserves DEFAULT_MIN_CLUSTER_SIZE", () => {
  assert.equal(
    resolveMinClusterSize({ allowPairClusters: false }),
    DEFAULT_MIN_CLUSTER_SIZE,
  );
});
