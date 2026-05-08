import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: substring-only mentions like `interdependency` do not pick up adjacent #N", () => {
  const body = `## Background\n\nThe interdependency between modules sometimes references #999, but this is not a dep declaration.\n\n## Plan\n\nWork on it.`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(!nums.includes(999), `999 should not be picked up from substring 'interdependency'`);
});
