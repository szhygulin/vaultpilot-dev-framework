import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility <= 1 for an empty record (0..1 contract)", () => {
  const u = composeUtility({} as any);
  assert.ok(u <= 1, `expected u <= 1, got ${u}`);
});
