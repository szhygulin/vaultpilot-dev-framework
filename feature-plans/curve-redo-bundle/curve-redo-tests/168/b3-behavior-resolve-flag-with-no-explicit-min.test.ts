import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ allowPairClusters: true }) without explicit min returns 2", () => {
  const result = resolveMinClusterSize({ allowPairClusters: true } as any);
  assert.equal(result, 2);
  assert.notEqual(result, DEFAULT_MIN_CLUSTER_SIZE, "flag must override default");
  assert.notEqual(result, 3, "flag must not leave default in place");
});
