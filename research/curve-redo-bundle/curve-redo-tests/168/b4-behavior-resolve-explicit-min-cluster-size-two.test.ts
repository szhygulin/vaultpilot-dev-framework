import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 2 }): direct numeric still allowed", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 2 }), 2);
});
