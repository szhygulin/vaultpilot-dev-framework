import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct rejects Infinity", () => {
  assert.throws(() => resolveMaxSavingsPct(Number.POSITIVE_INFINITY));
});
