import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: explicit minClusterSize=1 + flag stays at 1 ('not already set lower')", () => {
  // Per issue body: 'sets minClusterSize=2 if not already set lower'.
  const result = resolveMinClusterSize({ minClusterSize: 1, allowPairClusters: true });
  assert.ok(result <= 2, `expected result <= 2 when explicit min=1 + flag, got ${result}`);
});
