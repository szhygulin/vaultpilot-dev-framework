import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: pulls #N from a `## Depends on` heading block", () => {
  const body = `Body.\n\n## Depends on\n\n#222 must land first.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(222), `expected 222 in ${JSON.stringify(nums)}`);
});
