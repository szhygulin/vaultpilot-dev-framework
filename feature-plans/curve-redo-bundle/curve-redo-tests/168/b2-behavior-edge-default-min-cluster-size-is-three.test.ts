import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE } from "./compactClaudeMd.js";

test("DEFAULT_MIN_CLUSTER_SIZE: equals exactly 3 (unchanged safety default)", () => {
  assert.equal(DEFAULT_MIN_CLUSTER_SIZE, 3);
  assert.equal(typeof DEFAULT_MIN_CLUSTER_SIZE, "number");
});
