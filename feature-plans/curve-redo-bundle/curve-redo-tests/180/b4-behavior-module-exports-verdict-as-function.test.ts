import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "./assessClaudeMd.js";

test("module: 'verdict' export is a function with arity >= 3 (section, utilityRecord, contextCostFactor)", () => {
  const fn = (mod as any).verdict;
  assert.equal(typeof fn, "function", "verdict export must be a function");
  assert.ok(fn.length >= 3 || fn.length === 0, `expected fn.length to be >=3 or 0 (rest/destructure), got ${fn.length}`);
  const section = { id: "s0", bytes: 100 } as any;
  const result = fn(section, undefined, 1.0);
  assert.ok(result === "keep" || result === "trim" || result === "drop");
});
