// buildResumeContextMap is exported from cli.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 cli build resume context map exported", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /export\s+(async\s+)?function\s+buildResumeContextMap\b/);
});
