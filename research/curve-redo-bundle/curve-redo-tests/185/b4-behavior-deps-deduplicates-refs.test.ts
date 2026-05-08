import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: dedupes repeated #N refs to a single entry", () => {
  const body = `## Dependencies\n\n- #178 must land\n- See #178 for context\n- Also #178 noted again\n`;
  const refs = extractDependencyRefs(body);
  const matching = refs.filter((r: any) => r.number === 178);
  assert.equal(matching.length, 1, `expected dedup to 1 occurrence, got ${matching.length}`);
});
