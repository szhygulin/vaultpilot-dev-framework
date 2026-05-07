import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("--allow-pair-clusters does not raise an explicit minClusterSize=1 back up to 2", () => {
  assert.equal(
    resolveMinClusterSize({ minClusterSize: 1, allowPairClusters: true }),
    1,
  );
});
