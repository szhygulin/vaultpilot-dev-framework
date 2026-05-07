import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: pulls #N from a `## Blocked by` heading block", () => {
  const body = `Setup.\n\n## Blocked by\n\n- #444\n\n## Notes\n#999 is not a dep.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(444), `expected 444 in ${JSON.stringify(nums)}`);
  assert.ok(!nums.includes(999), `did not expect 999 (not in dep block)`);
});
