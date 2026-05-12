// isRunComplete treats aborted-budget terminal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 isruncomplete treats aborted terminal", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /isRunComplete[\s\S]*?aborted-budget/);
});
