import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: result is a finite integer for all sensible inputs", () => {
  for (const opts of [
    {},
    { allowPairClusters: true },
    { allowPairClusters: false },
    { minClusterSize: 2 },
    { minClusterSize: 5 },
    { allowPairClusters: true, minClusterSize: 2 },
  ]) {
    const r = resolveMinClusterSize(opts);
    assert.equal(typeof r, "number");
    assert.ok(Number.isFinite(r), `not finite: ${r}`);
    assert.ok(Number.isInteger(r), `not integer: ${r}`);
    assert.ok(r >= 2, `below pair floor: ${r}`);
  }
});
