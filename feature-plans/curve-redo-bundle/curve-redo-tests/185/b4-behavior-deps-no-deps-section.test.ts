import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: body with no dep heading/keyword yields no refs even when #N appear", () => {
  const body = `## Problem\n\nThis was discovered in #180 and we filed #181 to track it.\n\n## Proposal\n\nFix it.`;
  const refs = extractDependencyRefs(body);
  assert.equal(refs.length, 0, `expected no refs, got ${JSON.stringify(refs)}`);
});
