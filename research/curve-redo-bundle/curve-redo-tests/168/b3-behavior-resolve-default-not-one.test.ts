import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({}) >= 3 — issue rejects more aggressive defaults", () => {
  const result = resolveMinClusterSize({} as any);
  assert.ok(result >= 3, `default returned ${result} which is < 3 — issue says default stays 3`);
  assert.equal(result, DEFAULT_MIN_CLUSTER_SIZE);
});
