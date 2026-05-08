import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: 'Blocks:' (not in keyword list) does not capture refs", () => {
  const body = "Blocks: #178 (we block #200 from landing too).\n";
  const refs = parseDependencyRefs(body);
  assert.equal(refs.length, 0);
});
