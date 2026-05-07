import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: pulls #N from a `## Dependencies` heading block", () => {
  const body = `Some intro.\n\n## Dependencies\n\n- #178 (Phase 1) MUST land first — verdicts off the file need that.\n\n## Other section\n\nNot a dep.`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(178), `expected 178 in ${JSON.stringify(nums)}`);
});
