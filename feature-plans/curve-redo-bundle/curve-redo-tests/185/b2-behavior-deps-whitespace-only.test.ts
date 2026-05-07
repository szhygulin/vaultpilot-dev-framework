import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: whitespace-only body returns empty array", () => {
  const refs = parseDependencyRefs("   \n\n  \t\n");
  assert.equal(refs.length, 0);
});
