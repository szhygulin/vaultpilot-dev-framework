import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR } from "./compactClaudeMd.js";

test("PAIR_CLUSTER_FLOOR: equals 2 (the floor --allow-pair-clusters drops to)", () => {
  assert.equal(PAIR_CLUSTER_FLOOR, 2);
});
