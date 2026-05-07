import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: duplicate refs collapse to a single distinct issue", () => {
  const body = "## Dependencies\n\n#178 - first mention\n\nAlso #178 again, and once more #178.\n";
  const refs = parseDependencyRefs(body);
  const distinct = new Set(refs);
  assert.equal(distinct.size, 1);
  assert.ok(distinct.has(178));
});
