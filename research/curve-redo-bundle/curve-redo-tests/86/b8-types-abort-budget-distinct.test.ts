// Aborted-budget terminal state comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b8 types abort budget distinct", () => {
  const src = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
  assert.match(src, /distinct|operator policy/);
});
