// No-op when issue missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 mark aborted no op missing", () => {
  const src = readFileSync(resolve(process.cwd(), "src/state/runState.ts"), "utf8");
  assert.match(src, /if\s*\(\s*!existing\s*\)\s*return/);
});
