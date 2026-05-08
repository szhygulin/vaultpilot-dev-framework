import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: combines refs from multiple dep-style headings", () => {
  const body = `## Dependencies

#100

## Blocked by

#200
`;
  const refs = parseDependencies(body);
  const arr = [...refs];
  assert.ok(arr.includes(100), `expected 100 in ${JSON.stringify(arr)}`);
  assert.ok(arr.includes(200), `expected 200 in ${JSON.stringify(arr)}`);
});
