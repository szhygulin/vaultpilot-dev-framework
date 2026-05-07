import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: heading with trailing whitespace still matches", () => {
  const body = "## Dependencies   \n\n#321\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(321));
});
