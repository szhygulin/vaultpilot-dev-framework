import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: dep heading with no #N inside yields no refs", () => {
  const body = `## Dependencies\n\nNone — this is standalone.\n\n## Proposal\n\nDo work.`;
  const refs = extractDependencyRefs(body);
  assert.equal(refs.length, 0, `expected empty, got ${JSON.stringify(refs)}`);
});
