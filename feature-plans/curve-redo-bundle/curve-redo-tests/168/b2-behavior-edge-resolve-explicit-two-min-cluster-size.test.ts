import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: explicit minClusterSize=2 returns 2 (at-floor boundary)", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 2 }), 2);
});
