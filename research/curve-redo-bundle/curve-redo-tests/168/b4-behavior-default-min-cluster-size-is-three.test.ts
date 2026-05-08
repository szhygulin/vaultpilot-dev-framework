import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE } from "./compactClaudeMd.js";

test("DEFAULT_MIN_CLUSTER_SIZE: stays at 3 (per #158, the safety story)", () => {
  assert.equal(DEFAULT_MIN_CLUSTER_SIZE, 3);
});
