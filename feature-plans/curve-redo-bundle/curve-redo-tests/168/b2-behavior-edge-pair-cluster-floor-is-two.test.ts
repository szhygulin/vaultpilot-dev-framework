import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR } from "./compactClaudeMd.js";

test("PAIR_CLUSTER_FLOOR: equals exactly 2 (the lowered floor for opt-in pair clusters)", () => {
  assert.equal(PAIR_CLUSTER_FLOOR, 2);
  assert.equal(typeof PAIR_CLUSTER_FLOOR, "number");
});
