import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: ## Blocked by heading captures inner ref", () => {
  const body = "## Blocked by\n\n#42\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(42));
});
