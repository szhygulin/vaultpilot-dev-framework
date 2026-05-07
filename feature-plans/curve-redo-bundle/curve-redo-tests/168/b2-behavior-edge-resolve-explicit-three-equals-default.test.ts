import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: explicit minClusterSize=3 returns 3 (matches default exactly)", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 3 }), 3);
});
