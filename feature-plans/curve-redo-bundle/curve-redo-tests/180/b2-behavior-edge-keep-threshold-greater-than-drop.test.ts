import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_THRESHOLD, DROP_THRESHOLD } from "./assessClaudeMd.js";

test("KEEP_THRESHOLD strictly greater than DROP_THRESHOLD", () => {
  assert.ok(
    KEEP_THRESHOLD > DROP_THRESHOLD,
    `expected KEEP_THRESHOLD (${KEEP_THRESHOLD}) > DROP_THRESHOLD (${DROP_THRESHOLD})`,
  );
});
