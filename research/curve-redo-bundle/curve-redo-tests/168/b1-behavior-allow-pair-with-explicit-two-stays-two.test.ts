import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("--allow-pair-clusters with explicit minClusterSize=2 still returns 2", () => {
  assert.equal(
    resolveMinClusterSize({ minClusterSize: 2, allowPairClusters: true }),
    2,
  );
});
