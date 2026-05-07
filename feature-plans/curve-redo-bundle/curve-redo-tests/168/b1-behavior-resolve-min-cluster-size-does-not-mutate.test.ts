import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize does not mutate the input options object", () => {
  const opts = { minClusterSize: 5, allowPairClusters: true };
  const snapshot = JSON.stringify(opts);
  resolveMinClusterSize(opts);
  assert.equal(JSON.stringify(opts), snapshot);
});
