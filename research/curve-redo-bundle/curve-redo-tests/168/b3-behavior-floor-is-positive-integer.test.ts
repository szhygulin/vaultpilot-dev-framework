import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR } from "./compactClaudeMd.js";

test("PAIR_CLUSTER_FLOOR is a positive finite integer", () => {
  assert.equal(typeof PAIR_CLUSTER_FLOOR, "number");
  assert.ok(Number.isInteger(PAIR_CLUSTER_FLOOR), "must be an integer");
  assert.ok(Number.isFinite(PAIR_CLUSTER_FLOOR), "must be finite");
  assert.ok(PAIR_CLUSTER_FLOOR > 0, "must be > 0 — a cluster of 0 or negative makes no sense");
});
