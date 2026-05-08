import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 2 }) returns 2, not the default", () => {
  const result = resolveMinClusterSize({ minClusterSize: 2 } as any);
  assert.equal(result, 2);
  assert.notEqual(result, DEFAULT_MIN_CLUSTER_SIZE);
});
