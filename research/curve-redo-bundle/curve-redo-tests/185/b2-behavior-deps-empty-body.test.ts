import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: empty string returns empty array", () => {
  const refs = parseDependencyRefs("");
  assert.ok(Array.isArray(refs));
  assert.equal(refs.length, 0);
});
