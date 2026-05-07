import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: explicit minClusterSize=1 + allowPairClusters preserves 1", () => {
  const result = resolveMinClusterSize({
    minClusterSize: 1,
    allowPairClusters: true,
  } as any);
  assert.equal(result, 1, "issue: 'sets minClusterSize=2 if not already set lower' — 1 is already lower");
  assert.notEqual(result, 2, "the flag must not raise an explicitly lower value");
});
