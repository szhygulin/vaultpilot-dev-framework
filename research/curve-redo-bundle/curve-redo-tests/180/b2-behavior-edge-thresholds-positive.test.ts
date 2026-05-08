import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_THRESHOLD, DROP_THRESHOLD } from "./assessClaudeMd.js";

test("KEEP_THRESHOLD > 0 and DROP_THRESHOLD >= 0", () => {
  assert.ok(KEEP_THRESHOLD > 0, `KEEP_THRESHOLD must be positive, got ${KEEP_THRESHOLD}`);
  assert.ok(DROP_THRESHOLD >= 0, `DROP_THRESHOLD must be non-negative, got ${DROP_THRESHOLD}`);
});
