import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAX_SAVINGS_PCT } from "./tightenClaudeMd.js";

test("DEFAULT_MAX_SAVINGS_PCT: exports the issue's stated default of 40", () => {
  assert.equal(DEFAULT_MAX_SAVINGS_PCT, 40);
  assert.equal(typeof DEFAULT_MAX_SAVINGS_PCT, "number");
});
