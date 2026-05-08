import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize result is always an integer", () => {
  const cases: Array<unknown> = [
    {},
    { allowPairClusters: true },
    { minClusterSize: 1 },
    { minClusterSize: 7 },
    { allowPairClusters: false, minClusterSize: 3 },
  ];
  for (const c of cases) {
    const r = resolveMinClusterSize(c as any);
    assert.ok(Number.isInteger(r), `non-integer ${r} for input ${JSON.stringify(c)}`);
  }
});
