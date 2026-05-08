import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_CLUSTER_SIZE } from "./compactClaudeMd.js";

test("DEFAULT_MIN_CLUSTER_SIZE remains 3 (issue #158 safety floor)", () => {
  assert.equal(DEFAULT_MIN_CLUSTER_SIZE, 3);
});
