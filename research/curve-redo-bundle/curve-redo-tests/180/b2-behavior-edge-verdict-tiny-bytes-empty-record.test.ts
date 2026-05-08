import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict for 1-byte section + empty record is not 'keep'", () => {
  // Even at the minimum positive byte size, a section with measured-zero
  // utility shouldn't be classified as 'keep' — the keep band is reserved
  // for sections with positive signal.
  const result = verdict({ bytes: 1 } as any, {} as any, 1.0);
  assert.notEqual(result, "keep");
});
