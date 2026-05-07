import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: refs inside markdown list items are detected", () => {
  const body = `## Prerequisites\n\n* #501\n* #502\n+ #503\n- #504\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  for (const n of [501, 502, 503, 504]) {
    assert.ok(nums.includes(n), `expected ${n} in ${JSON.stringify(nums)}`);
  }
});
