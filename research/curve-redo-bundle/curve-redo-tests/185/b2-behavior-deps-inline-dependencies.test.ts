import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: inline 'Dependencies: #N' captures ref", () => {
  const body = "Some intro paragraph.\n\nDependencies: #178 must land first.\n\nMore body.";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(178));
});
