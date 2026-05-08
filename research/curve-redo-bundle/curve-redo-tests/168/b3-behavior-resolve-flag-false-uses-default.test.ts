import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ allowPairClusters: false }) returns DEFAULT_MIN_CLUSTER_SIZE", () => {
  const result = resolveMinClusterSize({ allowPairClusters: false } as any);
  assert.equal(result, DEFAULT_MIN_CLUSTER_SIZE);
});
