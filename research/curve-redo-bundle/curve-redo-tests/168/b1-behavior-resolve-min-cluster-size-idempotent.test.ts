import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize is pure: repeated calls return the same number", () => {
  const a = resolveMinClusterSize({ allowPairClusters: true });
  const b = resolveMinClusterSize({ allowPairClusters: true });
  const c = resolveMinClusterSize({ allowPairClusters: true });
  assert.equal(a, b);
  assert.equal(b, c);
});
