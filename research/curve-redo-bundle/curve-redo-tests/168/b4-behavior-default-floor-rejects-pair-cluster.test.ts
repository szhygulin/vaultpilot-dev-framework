import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, resolveMinClusterSize } from "./compactClaudeMd.js";

test("observable contract: default-resolved floor excludes 2-section clusters", () => {
  const floor = resolveMinClusterSize();
  // A pair cluster is size 2; under default it must be filtered out.
  assert.ok(
    2 < floor,
    `expected default floor (${floor}) to exclude pair clusters of size 2`,
  );
  assert.equal(floor, DEFAULT_MIN_CLUSTER_SIZE);
});
