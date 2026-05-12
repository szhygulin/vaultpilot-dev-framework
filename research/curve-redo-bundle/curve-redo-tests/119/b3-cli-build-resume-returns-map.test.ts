// buildResumeContextMap returns Map of ResumeContext.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 cli build resume returns map", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /buildResumeContextMap[\s\S]*?:\s*Promise<\s*Map<\s*number\s*,\s*ResumeContext\s*>/);
});
