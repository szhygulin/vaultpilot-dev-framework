import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: pure function — repeated calls return same result", () => {
  const opts = { allowPairClusters: true };
  const a = resolveMinClusterSize(opts);
  const b = resolveMinClusterSize(opts);
  const c = resolveMinClusterSize({ allowPairClusters: true });
  assert.equal(a, b);
  assert.equal(b, c);
});
