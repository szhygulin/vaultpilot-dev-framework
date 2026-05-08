import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: pulls #N from a `## Prerequisites` heading block", () => {
  const body = `Intro.\n\n## Prerequisites\n\nThis depends on #333 landing.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(333), `expected 333 in ${JSON.stringify(nums)}`);
});
