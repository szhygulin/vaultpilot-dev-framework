// Negative: a typo'd export, or accidental default-only export, would make
// every downstream call site silently fall through to 'undefined is not a
// function' at runtime. Surface that here.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as lu from "./lessonUtility.js";

test("lessonUtility module: exports a callable deriveStableId", () => {
  assert.equal(typeof lu.deriveStableId, "function");
});

test("lessonUtility module: deriveStableId arity is 2 (runId, issueId)", () => {
  // The spec describes f(sentinel-runId, sentinel-issueId) — anything else
  // is a contract violation worth flagging.
  assert.equal(lu.deriveStableId.length, 2);
});

test("lessonUtility module: deriveStableId does not return undefined for valid input", () => {
  const out = lu.deriveStableId("run-A", "issue:#100");
  assert.notEqual(out, undefined);
  assert.notEqual(out, null);
  assert.equal(typeof out, "string");
  assert.notEqual(out, "");
});
