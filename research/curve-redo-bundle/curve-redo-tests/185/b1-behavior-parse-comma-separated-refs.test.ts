import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts comma-separated refs under ## Dependencies", () => {
  const body = "## Dependencies\n\n#178, #179, #180\n";
  const refs = parseDependencies(body);
  const arr = [...refs];
  assert.ok(arr.includes(178), `expected 178 in ${JSON.stringify(arr)}`);
  assert.ok(arr.includes(179), `expected 179 in ${JSON.stringify(arr)}`);
  assert.ok(arr.includes(180), `expected 180 in ${JSON.stringify(arr)}`);
});
