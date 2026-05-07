import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: inline word 'dependencies' without colon does not capture refs", () => {
  const body = "The dependencies of this package include numerous downstream consumers; see issue #999 for context.\n";
  const refs = parseDependencyRefs(body);
  assert.equal(refs.length, 0);
});
