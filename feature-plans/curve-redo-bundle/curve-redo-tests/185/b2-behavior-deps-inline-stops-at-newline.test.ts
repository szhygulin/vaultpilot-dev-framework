import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: inline 'Dependencies:' captures only refs on same line", () => {
  const body = "Dependencies: #178\n\nLater paragraph mentions #999 unrelated.\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(178));
  assert.equal(refs.includes(999), false);
});
