import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ allowPairClusters: true }) does NOT return DEFAULT_MIN_CLUSTER_SIZE", () => {
  const result = resolveMinClusterSize({ allowPairClusters: true } as any);
  assert.notEqual(
    result,
    DEFAULT_MIN_CLUSTER_SIZE,
    "if the flag does not lower the floor, the flag is a no-op",
  );
});
