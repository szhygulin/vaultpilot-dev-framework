import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: inline singular `Dependency: #N` matches the Dependencies? regex", () => {
  const body = `Notes.\n\nDependency: #777 must merge first.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(777), `expected 777 in ${JSON.stringify(nums)}`);
});
