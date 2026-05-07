import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, PAIR_CLUSTER_FLOOR, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: default minus flag floor equals 1 (3 -> 2)", () => {
  const def = resolveMinClusterSize({} as any);
  const flagged = resolveMinClusterSize({ allowPairClusters: true } as any);
  assert.equal(def - flagged, 1, `expected default-flagged = 1, got ${def} - ${flagged}`);
  assert.equal(def, DEFAULT_MIN_CLUSTER_SIZE);
  assert.equal(flagged, PAIR_CLUSTER_FLOOR);
});
