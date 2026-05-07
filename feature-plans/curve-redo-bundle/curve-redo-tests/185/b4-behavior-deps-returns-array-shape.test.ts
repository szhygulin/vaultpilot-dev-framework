import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDependencyRefs } from "./dependencies.js";

test("extractDependencyRefs: returns an array of refs each with numeric `.number`", () => {
  const body = `## Dependencies\n\n- #42 must land\n`;
  const refs = extractDependencyRefs(body);
  assert.ok(Array.isArray(refs), `expected an array`);
  assert.equal(refs.length, 1);
  const ref: any = refs[0];
  assert.equal(typeof ref.number, "number", `each ref should expose a numeric .number, got ${typeof ref.number}`);
  assert.equal(ref.number, 42);
});
