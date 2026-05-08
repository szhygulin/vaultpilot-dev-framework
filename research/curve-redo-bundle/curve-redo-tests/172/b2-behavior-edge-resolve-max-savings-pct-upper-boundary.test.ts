import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct: 100 (upper boundary) is preserved", () => {
  assert.equal(resolveMaxSavingsPct(100), 100);
});
