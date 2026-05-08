import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: collects refs across multi-paragraph dep block", () => {
  const body = `## Dependencies\n\nFirst paragraph mentioning #601.\n\nSecond paragraph: also blocks on #602 and #603.\n\n## Next\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(601));
  assert.ok(nums.includes(602));
  assert.ok(nums.includes(603));
});
