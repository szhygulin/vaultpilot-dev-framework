import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: explicit minClusterSize=4 returns 4 (one above default)", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 4 }), 4);
});
