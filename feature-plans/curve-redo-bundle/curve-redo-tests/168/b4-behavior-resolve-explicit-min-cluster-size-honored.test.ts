import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 4 }): explicit numeric arg is honored", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 4 }), 4);
});
