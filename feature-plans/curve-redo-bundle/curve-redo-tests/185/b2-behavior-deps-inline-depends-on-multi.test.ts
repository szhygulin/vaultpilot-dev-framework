import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: inline 'Depends on: #A, #B' captures both refs", () => {
  const body = "Depends on: #100, #200\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(100));
  assert.ok(refs.includes(200));
});
