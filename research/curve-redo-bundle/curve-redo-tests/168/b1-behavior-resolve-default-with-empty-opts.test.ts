import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({}) returns the default 3", () => {
  assert.equal(resolveMinClusterSize({}), 3);
});
