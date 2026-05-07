import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct rejects 0%", () => {
  assert.throws(() => resolveMaxSavingsPct(0));
});
