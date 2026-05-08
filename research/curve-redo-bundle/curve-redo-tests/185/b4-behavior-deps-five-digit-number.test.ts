import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: five-digit issue numbers are valid refs", () => {
  const body = `## Dependencies\n\n- #12345\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(12345), `expected 12345 in ${JSON.stringify(nums)}`);
});
