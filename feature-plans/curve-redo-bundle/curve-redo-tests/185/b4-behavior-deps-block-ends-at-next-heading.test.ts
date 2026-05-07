import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: dep block boundary stops at the next `##` heading", () => {
  const body = `## Dependencies\n\n- #11\n\n## Other\n\n- #22\n- #33\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(11));
  assert.ok(!nums.includes(22), `22 is in another section, not a dep`);
  assert.ok(!nums.includes(33), `33 is in another section, not a dep`);
});
