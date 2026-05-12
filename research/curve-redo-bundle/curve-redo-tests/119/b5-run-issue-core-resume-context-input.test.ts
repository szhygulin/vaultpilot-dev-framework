// RunIssueCoreInput accepts resumeContext.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 run issue core resume context input", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  assert.match(src, /RunIssueCoreInput[\s\S]*?resumeContext\s*\?\s*:/);
});
