import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE } from "./compactClaudeMd.js";

test("DEFAULT_MIN_CLUSTER_SIZE is a positive integer", () => {
  assert.equal(typeof DEFAULT_MIN_CLUSTER_SIZE, "number");
  assert.ok(Number.isInteger(DEFAULT_MIN_CLUSTER_SIZE));
  assert.ok(DEFAULT_MIN_CLUSTER_SIZE > 0);
});
