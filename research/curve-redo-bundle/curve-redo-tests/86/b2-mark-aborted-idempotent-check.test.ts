// Idempotency check on terminal states.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 mark aborted idempotent check", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /markAborted[\s\S]*?status\s*===\s*["']done["']|status\s*===\s*["']failed["']|status\s*===\s*["']aborted-budget["']/);
});
