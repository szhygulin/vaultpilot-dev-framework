import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: combines refs from heading block and inline mention", () => {
  const body = `## Dependencies\n\n- #800\n\n## Other\n\nDepends on: #801 to ship.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(800), `expected 800 from heading block`);
  assert.ok(nums.includes(801), `expected 801 from inline mention`);
});
