import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_THRESHOLD, DROP_THRESHOLD } from "./assessClaudeMd.js";

test("thresholds are exported as JS numbers", () => {
  assert.equal(typeof KEEP_THRESHOLD, "number");
  assert.equal(typeof DROP_THRESHOLD, "number");
});
