import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: with flag, result <= PAIR_CLUSTER_FLOOR", () => {
  for (const opts of [
    { allowPairClusters: true },
    { allowPairClusters: true, minClusterSize: 3 },
    { allowPairClusters: true, minClusterSize: 5 },
    { allowPairClusters: true, minClusterSize: 2 },
  ]) {
    const v = resolveMinClusterSize(opts);
    assert.ok(
      v <= PAIR_CLUSTER_FLOOR,
      `expected <= ${PAIR_CLUSTER_FLOOR} for ${JSON.stringify(opts)}, got ${v}`,
    );
  }
});
