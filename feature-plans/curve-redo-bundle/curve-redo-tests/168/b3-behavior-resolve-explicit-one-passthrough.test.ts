import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 1 }) returns 1 — explicit lower must not be raised", () => {
  const result = resolveMinClusterSize({ minClusterSize: 1 } as any);
  assert.equal(result, 1);
});
