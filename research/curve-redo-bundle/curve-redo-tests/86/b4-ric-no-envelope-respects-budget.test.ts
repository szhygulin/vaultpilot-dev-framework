// No-envelope path respects budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 ric no envelope respects budget", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/runIssueCore.ts"), "utf8");
  assert.match(src, /!input\.skipSummary\s*&&\s*!budgetExceededAtCompletion/);
});
