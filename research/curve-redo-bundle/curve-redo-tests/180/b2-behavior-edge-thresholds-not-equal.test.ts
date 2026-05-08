import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_THRESHOLD, DROP_THRESHOLD } from "./assessClaudeMd.js";

test("KEEP_THRESHOLD !== DROP_THRESHOLD so 'trim' band is non-empty", () => {
  assert.notEqual(KEEP_THRESHOLD, DROP_THRESHOLD);
});
