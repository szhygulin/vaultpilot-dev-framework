import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR } from "./compactClaudeMd.js";

test("PAIR_CLUSTER_FLOOR is a positive integer", () => {
  assert.equal(typeof PAIR_CLUSTER_FLOOR, "number");
  assert.ok(Number.isInteger(PAIR_CLUSTER_FLOOR));
  assert.ok(PAIR_CLUSTER_FLOOR > 0);
});
