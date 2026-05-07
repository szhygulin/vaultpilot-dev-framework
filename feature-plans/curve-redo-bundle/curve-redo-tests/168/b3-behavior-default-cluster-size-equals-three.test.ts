import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE } from "./compactClaudeMd.js";

test("DEFAULT_MIN_CLUSTER_SIZE: must stay 3 — issue says default does not change", () => {
  assert.equal(DEFAULT_MIN_CLUSTER_SIZE, 3, "issue explicitly says 'Default stays 3'");
});
