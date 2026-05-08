import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMaxSavingsPct } from "./tightenClaudeMd.js";

test("resolveMaxSavingsPct returns the operator override when provided", () => {
  assert.equal(resolveMaxSavingsPct(25), 25);
  assert.equal(resolveMaxSavingsPct(60), 60);
});
