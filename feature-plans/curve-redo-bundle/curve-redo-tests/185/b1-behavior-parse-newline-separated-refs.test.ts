import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts newline-separated refs under heading", () => {
  const body = "## Dependencies\n\n#178\n#179\n#180\n";
  const refs = parseDependencies(body);
  const arr = [...refs];
  assert.ok(arr.includes(178));
  assert.ok(arr.includes(179));
  assert.ok(arr.includes(180));
});
