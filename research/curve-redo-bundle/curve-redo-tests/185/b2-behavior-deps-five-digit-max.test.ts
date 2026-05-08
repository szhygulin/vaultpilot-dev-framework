import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: five-digit ref #99999 is captured", () => {
  const body = "## Dependencies\n#99999\n";
  const refs = parseDependencyRefs(body);
  assert.ok(refs.includes(99999));
});
