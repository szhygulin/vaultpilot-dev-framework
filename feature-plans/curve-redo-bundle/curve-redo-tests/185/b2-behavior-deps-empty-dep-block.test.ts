import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: ## Dependencies block with no #refs yields empty array", () => {
  const body = "## Dependencies\n\nNone yet.\n";
  const refs = parseDependencyRefs(body);
  assert.equal(refs.length, 0);
});
