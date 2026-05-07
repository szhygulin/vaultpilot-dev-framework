import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: very large explicit minClusterSize is preserved verbatim", () => {
  assert.equal(resolveMinClusterSize({ minClusterSize: 100 }), 100);
});
