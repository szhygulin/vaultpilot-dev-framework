import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_CLUSTER_FLOOR } from "./compactClaudeMd.js";

test("PAIR_CLUSTER_FLOOR: floor of 2 is the entire point of the issue", () => {
  assert.equal(PAIR_CLUSTER_FLOOR, 2, "floor must be 2 — anything else defeats the --allow-pair-clusters semantics");
});
