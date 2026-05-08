import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct rejects values above 100", () => {
  assert.throws(() => resolveMaxSavingsPct(150));
});
