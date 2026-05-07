import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: multiple #N refs inside one dep block are all extracted", () => {
  const body = `## Dependencies\n\n- #100\n- #101 (parser fix)\n- #102 also required\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number).sort((a: number, b: number) => a - b);
  assert.ok(nums.includes(100));
  assert.ok(nums.includes(101));
  assert.ok(nums.includes(102));
});
