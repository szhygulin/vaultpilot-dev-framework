import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize({ minClusterSize: 4 }) returns 4 — passthrough above default", () => {
  const result = resolveMinClusterSize({ minClusterSize: 4 } as any);
  assert.equal(result, 4);
});
