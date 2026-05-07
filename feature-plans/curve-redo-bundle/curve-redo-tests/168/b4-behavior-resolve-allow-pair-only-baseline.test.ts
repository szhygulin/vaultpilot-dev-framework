import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: --allow-pair-clusters is sugar for --min-cluster-size 2", () => {
  // Per issue: 'the flag is sugar for --min-cluster-size 2 with a clearer name'.
  assert.equal(
    resolveMinClusterSize({ allowPairClusters: true }),
    resolveMinClusterSize({ minClusterSize: 2 }),
  );
});
