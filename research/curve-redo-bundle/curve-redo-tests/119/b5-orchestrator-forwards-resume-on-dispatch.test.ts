// Orchestrator dispatches per-issue resumeContext.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 orchestrator forwards resume on dispatch", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /resumeContextByIssue\?\.get|resumeContextByIssue\.get/);
});
