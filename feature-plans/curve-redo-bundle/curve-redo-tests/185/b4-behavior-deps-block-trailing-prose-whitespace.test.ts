import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: tolerates indentation and prose around #N inside the dep block", () => {
  const body = `## Dependencies\n\n   #1234 (must land first)   \n\nNote: also blocks on #2345.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(1234), `expected 1234 in ${JSON.stringify(nums)}`);
  assert.ok(nums.includes(2345), `expected 2345 in ${JSON.stringify(nums)}`);
});
