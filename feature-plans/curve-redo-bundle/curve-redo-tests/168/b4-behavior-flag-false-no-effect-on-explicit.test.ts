import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: flag=false + explicit min=4 -> 4 (no implicit override)", () => {
  assert.equal(
    resolveMinClusterSize({ minClusterSize: 4, allowPairClusters: false }),
    4,
  );
});
