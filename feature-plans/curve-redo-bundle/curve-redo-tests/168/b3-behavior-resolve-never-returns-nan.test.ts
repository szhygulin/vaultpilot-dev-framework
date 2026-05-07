import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize never returns NaN for documented inputs", () => {
  const cases: Array<unknown> = [
    {},
    { allowPairClusters: true },
    { allowPairClusters: false },
    { minClusterSize: 1 },
    { minClusterSize: 2 },
    { minClusterSize: 5 },
    { minClusterSize: 1, allowPairClusters: true },
  ];
  for (const c of cases) {
    const r = resolveMinClusterSize(c as any);
    assert.ok(!Number.isNaN(r), `NaN returned for input ${JSON.stringify(c)}`);
  }
});
