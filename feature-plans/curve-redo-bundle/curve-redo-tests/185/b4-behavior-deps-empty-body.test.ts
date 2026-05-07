import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: empty body returns empty array", () => {
  const refs = extractDependencyRefs("");
  assert.ok(Array.isArray(refs));
  assert.equal(refs.length, 0);
});
