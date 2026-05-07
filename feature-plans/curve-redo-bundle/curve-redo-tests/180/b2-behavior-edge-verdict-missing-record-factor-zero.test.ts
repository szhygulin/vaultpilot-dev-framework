import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("missing utility record + contextCostFactor=0 returns 'keep'", () => {
  const result = verdict({ bytes: 100 } as any, undefined as any, 0);
  assert.equal(result, "keep");
});
