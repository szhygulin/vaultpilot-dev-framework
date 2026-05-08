import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts refs from markdown table rows under heading", () => {
  const body = `## Dependencies

| Issue | Phase |
|-------|-------|
| #178  | 1     |
| #179  | 2     |
`;
  const refs = parseDependencies(body);
  const arr = [...refs];
  assert.ok(arr.includes(178), `expected 178 in ${JSON.stringify(arr)}`);
  assert.ok(arr.includes(179), `expected 179 in ${JSON.stringify(arr)}`);
});
