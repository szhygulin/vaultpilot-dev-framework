// Bytes are a count and must never be negative; if the impl is permissive, it should still produce
// a valid enum, not garbage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: negative section.bytes either throws or yields a valid enum", () => {
  let threw = false;
  let result: unknown;
  try {
    result = verdict({ bytes: -100 } as any, {} as any, 1.0);
  } catch {
    threw = true;
  }
  if (!threw) {
    assert.ok(
      result === "keep" || result === "trim" || result === "drop",
      `permissive impl returned non-enum: ${JSON.stringify(result)}`,
    );
  }
});
