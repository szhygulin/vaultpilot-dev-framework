import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: result is always an integer", () => {
  for (const opts of [
    {},
    { allowPairClusters: true },
    { allowPairClusters: false },
    { minClusterSize: 2 },
    { minClusterSize: 4 },
    { minClusterSize: 5, allowPairClusters: true },
    { minClusterSize: 3, allowPairClusters: false },
  ]) {
    const v = resolveMinClusterSize(opts);
    assert.ok(Number.isInteger(v), `expected integer for ${JSON.stringify(opts)}, got ${v}`);
  }
});
