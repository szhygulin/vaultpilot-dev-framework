import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: inline `Dependencies: #178` mention is detected", () => {
  const body = `Some prose.\n\n*Dependencies: #178 (Phase 1) MUST land first — verdicts off state file need that file populated.*\n\nMore prose.`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(178), `expected 178 in ${JSON.stringify(nums)}`);
});
