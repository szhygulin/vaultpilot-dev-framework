import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 5 }) returns 5, never the default", () => {
  const result = resolveMinClusterSize({ minClusterSize: 5 } as any);
  assert.equal(result, 5);
  assert.notEqual(result, DEFAULT_MIN_CLUSTER_SIZE);
});
