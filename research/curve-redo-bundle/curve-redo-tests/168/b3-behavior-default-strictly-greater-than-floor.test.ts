import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE, PAIR_CLUSTER_FLOOR } from "./compactClaudeMd.js";

test("invariant: DEFAULT_MIN_CLUSTER_SIZE > PAIR_CLUSTER_FLOOR", () => {
  assert.ok(
    DEFAULT_MIN_CLUSTER_SIZE > PAIR_CLUSTER_FLOOR,
    `default (${DEFAULT_MIN_CLUSTER_SIZE}) must be strictly greater than floor (${PAIR_CLUSTER_FLOOR}) — otherwise the flag has no effect`,
  );
});
