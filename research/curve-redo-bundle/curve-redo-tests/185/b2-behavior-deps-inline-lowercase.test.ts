import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: inline 'dependencies:' lowercase still captures ref", () => {
  const body = "Intro paragraph.\n\ndependencies: #444 must merge first.\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(444));
});
