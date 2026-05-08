import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, PAIR_CLUSTER_FLOOR } from "./compactClaudeMd.js";

test("PAIR_CLUSTER_FLOOR < DEFAULT_MIN_CLUSTER_SIZE so opt-in actually lowers the floor", () => {
  assert.ok(
    PAIR_CLUSTER_FLOOR < DEFAULT_MIN_CLUSTER_SIZE,
    `expected pair floor (${PAIR_CLUSTER_FLOOR}) to be strictly less than default (${DEFAULT_MIN_CLUSTER_SIZE})`,
  );
});
