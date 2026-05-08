import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 3 }) returns 3 (matches default)", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 3 }), 3);
});
