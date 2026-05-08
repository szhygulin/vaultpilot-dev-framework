import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: extracts multiple inline refs in 'Dependencies: #N, #M' sentence", () => {
  const body = "Note. Dependencies: #178, #179, #180.\n";
  const refs = parseDependencies(body);
  const arr = [...refs];
  assert.ok(arr.includes(178), `expected 178 in ${JSON.stringify(arr)}`);
  assert.ok(arr.includes(179), `expected 179 in ${JSON.stringify(arr)}`);
  assert.ok(arr.includes(180), `expected 180 in ${JSON.stringify(arr)}`);
});
