import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: bullet-list refs under ## Dependencies are captured", () => {
  const body = "## Dependencies\n\n- #178\n- #200\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(178));
  assert.ok(refs.includes(200));
});
