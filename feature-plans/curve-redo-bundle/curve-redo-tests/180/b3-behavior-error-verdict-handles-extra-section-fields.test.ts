// Extra/unknown fields on a section object must be ignored, not crash the verdict pipeline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: tolerates unrelated fields on the section input", () => {
  const section = {
    bytes: 1024,
    id: "s7",
    heading: "Some heading",
    unrelated: { junk: true },
    arbitrary: 42,
  };
  let result: unknown;
  assert.doesNotThrow(() => {
    result = verdict(section as any, {} as any, 1.0);
  });
  assert.ok(
    result === "keep" || result === "trim" || result === "drop",
    `expected enum verdict, got ${JSON.stringify(result)}`,
  );
});
