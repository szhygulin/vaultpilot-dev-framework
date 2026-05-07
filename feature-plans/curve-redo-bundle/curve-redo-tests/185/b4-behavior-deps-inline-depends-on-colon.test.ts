import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: inline `Depends on: #N` mention is detected", () => {
  const body = `Some text.\n\nDepends on: #555, plus other context.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(nums.includes(555), `expected 555 in ${JSON.stringify(nums)}`);
});
