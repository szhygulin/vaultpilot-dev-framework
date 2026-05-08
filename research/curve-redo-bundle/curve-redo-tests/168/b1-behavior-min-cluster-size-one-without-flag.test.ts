import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 1 }) returns 1", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 1 }), 1);
});
