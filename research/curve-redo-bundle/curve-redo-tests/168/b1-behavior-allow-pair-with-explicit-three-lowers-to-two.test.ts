import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("--allow-pair-clusters lowers explicit minClusterSize=3 to 2", () => {
  assert.equal(
    resolveMinClusterSize({ minClusterSize: 3, allowPairClusters: true }),
    2,
  );
});
