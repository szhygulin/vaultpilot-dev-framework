import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAX_SAVINGS_PCT } from "./tightenClaudeMd.js";

test("DEFAULT_MAX_SAVINGS_PCT is 40", () => {
  assert.equal(DEFAULT_MAX_SAVINGS_PCT, 40);
});
