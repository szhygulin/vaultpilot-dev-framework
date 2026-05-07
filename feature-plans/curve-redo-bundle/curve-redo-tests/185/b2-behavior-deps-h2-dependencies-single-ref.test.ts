import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: ## Dependencies heading captures inner ref", () => {
  const body = "Intro paragraph.\n\n## Dependencies\n\n#178 (Phase 1) MUST land first.\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(178));
});
