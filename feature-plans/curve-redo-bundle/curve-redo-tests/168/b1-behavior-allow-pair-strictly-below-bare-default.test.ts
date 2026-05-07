import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ allowPairClusters: true }) < resolveMinClusterSize({})", () => {
  const lowered = resolveMinClusterSize({ allowPairClusters: true });
  const def = resolveMinClusterSize({});
  assert.ok(
    lowered < def,
    `expected lowered (${lowered}) to be strictly less than default (${def})`,
  );
});
