// OrchestratorInput exposes resumeContextByIssue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 orchestrator input has resume context by issue", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /OrchestratorInput[\s\S]*?resumeContextByIssue\s*\?\s*:/);
});
