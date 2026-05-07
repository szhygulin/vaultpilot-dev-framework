import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: refs joined by 'and' under ## Dependencies are both captured", () => {
  const body = "## Dependencies\n\n#178 and #200 must land first.\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(178));
  assert.ok(refs.includes(200));
});
