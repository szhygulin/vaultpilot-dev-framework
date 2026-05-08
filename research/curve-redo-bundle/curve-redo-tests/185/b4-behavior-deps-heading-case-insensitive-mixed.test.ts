import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: heading match is case-insensitive — `## DePeNdS On`", () => {
  const body = `## DePeNdS On\n\nThis blocks on #202.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(202), `expected 202 in ${JSON.stringify(nums)}`);
});
