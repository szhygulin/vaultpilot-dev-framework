import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAX_SAVINGS_PCT } from "./tightenClaudeMd.js";

test("DEFAULT_MAX_SAVINGS_PCT default is 40 per Phase A spec", () => {
  assert.equal(DEFAULT_MAX_SAVINGS_PCT, 40);
});
