import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("observable contract: with --allow-pair-clusters, pair clusters satisfy the floor", () => {
  const floor = resolveMinClusterSize({ allowPairClusters: true });
  assert.ok(
    2 >= floor,
    `expected pair-flag floor (${floor}) to admit clusters of size 2`,
  );
});
