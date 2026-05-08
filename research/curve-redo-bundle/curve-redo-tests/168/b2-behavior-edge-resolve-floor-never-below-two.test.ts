import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR, resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: opt-in path floors at PAIR_CLUSTER_FLOOR (no clusters of size 1)", () => {
  // The whole point of the issue is that the lowered floor is 2, not 1.
  // A pair-clusters opt-in must NOT degenerate into accepting size-1 "clusters".
  const r1 = resolveMinClusterSize({ allowPairClusters: true });
  const r2 = resolveMinClusterSize({ allowPairClusters: true, minClusterSize: 2 });
  assert.ok(r1 >= PAIR_CLUSTER_FLOOR, `flag-only resolved ${r1} below floor`);
  assert.ok(r2 >= PAIR_CLUSTER_FLOOR, `flag+explicit resolved ${r2} below floor`);
  assert.equal(PAIR_CLUSTER_FLOOR, 2);
});
