import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: allowPairClusters=true equivalent to --min-cluster-size 2 sugar", () => {
  // Issue: "the flag is sugar for `--min-cluster-size 2` with a clearer name"
  const viaFlag = resolveMinClusterSize({ allowPairClusters: true });
  const viaExplicit = resolveMinClusterSize({ minClusterSize: 2 });
  assert.equal(viaFlag, viaExplicit);
  assert.equal(viaFlag, 2);
});
