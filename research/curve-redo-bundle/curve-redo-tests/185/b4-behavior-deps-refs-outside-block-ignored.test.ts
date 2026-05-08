import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: ignores #N refs that appear outside the dep block / sentence", () => {
  const body = `## Dependencies\n\n- #178 must land first.\n\n## Notes\n\nWe also referenced #999 elsewhere but it is not a dep.\n\n## Out of scope\n\nDo not address #1000.`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(178));
  assert.ok(!nums.includes(999), `999 should not be considered a dep`);
  assert.ok(!nums.includes(1000), `1000 should not be considered a dep`);
});
