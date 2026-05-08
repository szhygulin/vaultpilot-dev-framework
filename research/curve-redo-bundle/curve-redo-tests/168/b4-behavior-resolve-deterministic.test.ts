import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: deterministic for identical input", () => {
  const opts = { minClusterSize: 5, allowPairClusters: true };
  const a = resolveMinClusterSize(opts);
  const b = resolveMinClusterSize(opts);
  const c = resolveMinClusterSize({ ...opts });
  assert.equal(a, b);
  assert.equal(b, c);
});
