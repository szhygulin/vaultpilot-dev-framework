import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize returns an integer for representative inputs", () => {
  for (const opts of [
    {},
    { allowPairClusters: true },
    { allowPairClusters: false },
    { minClusterSize: 2 },
    { minClusterSize: 4 },
    { minClusterSize: 5, allowPairClusters: true },
    { minClusterSize: 1, allowPairClusters: true },
  ]) {
    const out = resolveMinClusterSize(opts);
    assert.equal(typeof out, "number", `bad type for ${JSON.stringify(opts)}`);
    assert.ok(Number.isInteger(out), `not integer for ${JSON.stringify(opts)}`);
    assert.ok(out >= 1, `not >=1 for ${JSON.stringify(opts)}`);
  }
});
