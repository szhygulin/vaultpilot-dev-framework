import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: allowPairClusters omitted is identical to allowPairClusters=false", () => {
  const omitted = resolveMinClusterSize({});
  const explicitFalse = resolveMinClusterSize({ allowPairClusters: false });
  assert.equal(omitted, explicitFalse);
  assert.equal(omitted, DEFAULT_MIN_CLUSTER_SIZE);
});
