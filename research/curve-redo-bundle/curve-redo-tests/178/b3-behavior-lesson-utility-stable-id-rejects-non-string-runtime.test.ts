// Negative: passing null/undefined/number must either throw or coerce in a
// deterministic way that does not collide with a populated string input.
// This catches a String(x) coercion bug where String(null) === 'null' could
// silently collide with a runId literally named 'null'.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: undefined runId rejected or distinct from string 'undefined'", () => {
  let undefHash: string | undefined;
  try {
    // @ts-expect-error: deliberately violating the type contract at runtime
    undefHash = deriveStableId(undefined, "issue:#100");
  } catch {
    // throwing on bad input is the preferred loud-fail behavior
    return;
  }
  // If it didn't throw, it must at least not silently collide with a real
  // runId equal to the string 'undefined'.
  const literal = deriveStableId("undefined", "issue:#100");
  // Either a throw or a value distinct from the literal-string version is OK.
  // (We allow them to be equal only if the impl explicitly documents string
  // coercion; that's unusual and would be the bug we want surfaced.)
  if (undefHash !== undefined) {
    assert.notEqual(undefHash, literal);
  }
});

test("deriveStableId: null issueId rejected or distinct from string 'null'", () => {
  let nullHash: string | undefined;
  try {
    // @ts-expect-error: deliberately violating the type contract at runtime
    nullHash = deriveStableId("run-A", null);
  } catch {
    return;
  }
  const literal = deriveStableId("run-A", "null");
  if (nullHash !== undefined) {
    assert.notEqual(nullHash, literal);
  }
});
