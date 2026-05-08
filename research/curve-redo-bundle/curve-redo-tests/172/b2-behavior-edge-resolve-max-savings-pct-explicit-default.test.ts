import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct: explicit 40 returns 40", () => {
  assert.equal(resolveMaxSavingsPct(40), 40);
});
