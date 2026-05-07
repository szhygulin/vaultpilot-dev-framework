import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_THRESHOLD, DROP_THRESHOLD } from "./assessClaudeMd.js";

test("thresholds are finite numbers", () => {
  assert.ok(Number.isFinite(KEEP_THRESHOLD), `KEEP_THRESHOLD not finite: ${KEEP_THRESHOLD}`);
  assert.ok(Number.isFinite(DROP_THRESHOLD), `DROP_THRESHOLD not finite: ${DROP_THRESHOLD}`);
});
