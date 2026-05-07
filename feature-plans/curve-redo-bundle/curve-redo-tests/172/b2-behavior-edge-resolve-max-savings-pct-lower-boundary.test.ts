import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct: 1 (lower boundary) is preserved", () => {
  assert.equal(resolveMaxSavingsPct(1), 1);
});
