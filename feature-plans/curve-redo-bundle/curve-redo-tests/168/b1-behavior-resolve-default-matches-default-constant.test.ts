import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({}) === DEFAULT_MIN_CLUSTER_SIZE", () => {
  assert.equal(resolveMinClusterSize({}), DEFAULT_MIN_CLUSTER_SIZE);
});
