import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize result is always >= 1 for documented inputs", () => {
  const cases: Array<unknown> = [
    {},
    { allowPairClusters: true },
    { allowPairClusters: false },
    { minClusterSize: 1 },
    { minClusterSize: 3 },
    { minClusterSize: 10 },
    { allowPairClusters: true, minClusterSize: 1 },
  ];
  for (const c of cases) {
    const r = resolveMinClusterSize(c as any);
    assert.ok(r >= 1, `result ${r} < 1 for input ${JSON.stringify(c)}`);
    assert.ok(Number.isFinite(r), `result ${r} not finite for input ${JSON.stringify(c)}`);
  }
});
