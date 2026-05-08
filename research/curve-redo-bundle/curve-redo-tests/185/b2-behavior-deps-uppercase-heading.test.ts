import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: heading match is case-insensitive (uppercase)", () => {
  const body = "## DEPENDENCIES\n\n#7\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(7));
});
