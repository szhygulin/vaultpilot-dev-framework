import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize is a function", () => {
  assert.equal(typeof resolveMinClusterSize, "function");
});
