// The issue body explicitly says composeUtility returns 0.0 - 1.0; weights sum to 1.0 by design.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: empty record returns a finite number in [0, 1]", () => {
  const u = composeUtility({} as any);
  assert.equal(typeof u, "number");
  assert.ok(Number.isFinite(u), `expected finite number, got ${u}`);
  assert.ok(!Number.isNaN(u), "composeUtility must not return NaN on empty input");
  assert.ok(u >= 0 && u <= 1, `expected 0..1, got ${u}`);
});
