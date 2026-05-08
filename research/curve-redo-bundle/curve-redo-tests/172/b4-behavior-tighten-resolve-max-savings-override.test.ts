import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct: numeric override is preserved", () => {
  assert.equal(resolveMaxSavingsPct(55), 55);
  assert.equal(resolveMaxSavingsPct(20), 20);
});
