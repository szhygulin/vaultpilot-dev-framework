// Distinguishes status from outcome.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 runstate status vs outcome", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /status[\s\S]*?outcome|outcome[\s\S]*?status/);
});
