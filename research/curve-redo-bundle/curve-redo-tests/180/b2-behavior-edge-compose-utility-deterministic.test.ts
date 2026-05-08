import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility is deterministic for the same input", () => {
  const r = {} as any;
  const a = composeUtility(r);
  const b = composeUtility(r);
  const c = composeUtility(r);
  assert.equal(a, b);
  assert.equal(b, c);
});
