import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, PAIR_CLUSTER_FLOOR } from "./compactClaudeMd.js";

test("PAIR_CLUSTER_FLOOR !== DEFAULT_MIN_CLUSTER_SIZE", () => {
  assert.notEqual(
    PAIR_CLUSTER_FLOOR,
    DEFAULT_MIN_CLUSTER_SIZE,
    "if these two constants are equal, the new flag is a no-op",
  );
});
