import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: refs under a later non-dep heading are not captured", () => {
  const body = "## Dependencies\n\n#178\n\n## Files\n\nMaybe touch #999.\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(178));
  assert.equal(refs.includes(999), false);
});
