import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct rejects negative percentage", () => {
  assert.throws(() => resolveMaxSavingsPct(-10));
});
