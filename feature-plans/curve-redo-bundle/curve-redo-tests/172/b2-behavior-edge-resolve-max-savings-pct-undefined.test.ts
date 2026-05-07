import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAX_SAVINGS_PCT, resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct: undefined returns DEFAULT_MAX_SAVINGS_PCT", () => {
  assert.equal(resolveMaxSavingsPct(undefined), DEFAULT_MAX_SAVINGS_PCT);
});
