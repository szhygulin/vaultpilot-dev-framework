import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: comma-separated refs under ## Dependencies are all captured", () => {
  const body = "## Dependencies\n\n#178, #179, #180\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(178));
  assert.ok(refs.includes(179));
  assert.ok(refs.includes(180));
});
