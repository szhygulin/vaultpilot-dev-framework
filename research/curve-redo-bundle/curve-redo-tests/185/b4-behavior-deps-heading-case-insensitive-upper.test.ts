import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: heading match is case-insensitive — `## DEPENDENCIES`", () => {
  const body = `## DEPENDENCIES\n\n#101 must land first.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(101), `expected 101 in ${JSON.stringify(nums)}`);
});
