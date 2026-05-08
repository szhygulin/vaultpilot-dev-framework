import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ allowPairClusters: true }) returns 2", () => {
  assert.equal(resolveMinClusterSize({ allowPairClusters: true }), 2);
});
