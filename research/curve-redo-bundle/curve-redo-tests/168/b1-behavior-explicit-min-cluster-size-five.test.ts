import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 5 }) returns 5", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 5 }), 5);
});
