import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts refs from bullet list under ## Dependencies", () => {
  const body = `## Dependencies

- #178 — Phase 1 data collection
- #179 — Phase 2 measurement
`;
  const refs = parseDependencies(body);
  const arr = [...refs];
  assert.ok(arr.includes(178), `expected 178 in ${JSON.stringify(arr)}`);
  assert.ok(arr.includes(179), `expected 179 in ${JSON.stringify(arr)}`);
});
