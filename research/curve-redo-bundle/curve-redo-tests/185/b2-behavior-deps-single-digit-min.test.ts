import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: single-digit issue ref #1 is captured", () => {
  const body = "## Dependencies\n#1\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(1));
});
