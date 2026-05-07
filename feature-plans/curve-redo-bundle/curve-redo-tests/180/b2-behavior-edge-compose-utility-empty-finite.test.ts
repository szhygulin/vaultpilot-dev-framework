import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility returns a finite number for an empty record", () => {
  const u = composeUtility({} as any);
  assert.equal(typeof u, "number");
  assert.ok(Number.isFinite(u), `expected finite number, got ${u}`);
});
