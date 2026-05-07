import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 4 }) returns 4", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 4 }), 4);
});
