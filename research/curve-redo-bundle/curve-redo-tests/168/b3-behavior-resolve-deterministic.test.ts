import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize is pure — repeated calls with same input yield same output", () => {
  const inputs: Array<unknown> = [
    {},
    { allowPairClusters: true },
    { allowPairClusters: false },
    { minClusterSize: 4 },
    { minClusterSize: 1, allowPairClusters: true },
  ];
  for (const inp of inputs) {
    const a = resolveMinClusterSize(inp as any);
    const b = resolveMinClusterSize(inp as any);
    const c = resolveMinClusterSize(inp as any);
    assert.equal(a, b, `non-deterministic for ${JSON.stringify(inp)}: ${a} vs ${b}`);
    assert.equal(b, c, `non-deterministic for ${JSON.stringify(inp)}: ${b} vs ${c}`);
  }
});
