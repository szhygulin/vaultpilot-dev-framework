import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: ## Prerequisites heading captures inner ref", () => {
  const body = "## Prerequisites\n\n- #100\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(100));
});
