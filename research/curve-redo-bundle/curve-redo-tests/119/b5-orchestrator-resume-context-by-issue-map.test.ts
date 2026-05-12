// resumeContextByIssue is a Map<number, ResumeContext>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 orchestrator resume context by issue map", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /Map<\s*number\s*,\s*ResumeContext\s*>/);
});
