import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMinClusterSize } from "./compactClaudeMd.js";

test("resolveMinClusterSize: flag changes the resolved floor relative to default", () => {
  const withFlag = resolveMinClusterSize({ allowPairClusters: true });
  const withoutFlag = resolveMinClusterSize();
  assert.ok(
    withFlag < withoutFlag,
    `expected withFlag (${withFlag}) < withoutFlag (${withoutFlag})`,
  );
});
