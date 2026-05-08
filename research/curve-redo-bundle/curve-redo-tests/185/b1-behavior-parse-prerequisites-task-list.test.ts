import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts refs from task list under ## Prerequisites", () => {
  const body = `## Prerequisites

- [ ] #100 — must merge
- [ ] #101 — also required
- [ ] #102
`;
  const refs = parseDependencies(body);
  const arr = [...refs];
  assert.ok(arr.includes(100), `expected 100 in ${JSON.stringify(arr)}`);
  assert.ok(arr.includes(101), `expected 101 in ${JSON.stringify(arr)}`);
  assert.ok(arr.includes(102), `expected 102 in ${JSON.stringify(arr)}`);
});
