import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, PAIR_CLUSTER_FLOOR } from "./compactClaudeMd.js";

test("floors: PAIR_CLUSTER_FLOOR < DEFAULT_MIN_CLUSTER_SIZE invariant holds", () => {
  assert.ok(
    PAIR_CLUSTER_FLOOR < DEFAULT_MIN_CLUSTER_SIZE,
    `expected pair floor ${PAIR_CLUSTER_FLOOR} < default ${DEFAULT_MIN_CLUSTER_SIZE}`,
  );
  // Off-by-one: gap is exactly 1.
  assert.equal(DEFAULT_MIN_CLUSTER_SIZE - PAIR_CLUSTER_FLOOR, 1);
});
