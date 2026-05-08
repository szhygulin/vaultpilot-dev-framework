import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("--allow-pair-clusters lowers minClusterSize=5 to the pair floor 2", () => {
  assert.equal(
    resolveMinClusterSize({ minClusterSize: 5, allowPairClusters: true }),
    2,
  );
});
