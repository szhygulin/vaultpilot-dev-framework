import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: bare numbers without `#` are not extracted as refs", () => {
  const body = `## Dependencies\n\nThis depends on issue 178 — but the # is missing.\nAlso 200 things to do.\n`;
  const refs = extractDependencyRefs(body);
  const nums = refs.map((r: any) => r.number);
  assert.ok(!nums.includes(178), `178 without # should not match`);
  assert.ok(!nums.includes(200), `200 without # should not match`);
});
