import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility >= 0 for an empty record", () => {
  const u = composeUtility({} as any);
  assert.ok(u >= 0, `expected u >= 0, got ${u}`);
});
