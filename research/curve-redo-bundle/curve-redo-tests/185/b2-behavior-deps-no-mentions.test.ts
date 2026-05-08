import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: body with no dependency keywords returns empty array", () => {
  const body = "## Background\n\nThis issue describes a feature.\n\n## Proposal\n\nDo the thing.\n";
  const refs = parseDependencyRefs(body);
  assert.equal(refs.length, 0);
});
