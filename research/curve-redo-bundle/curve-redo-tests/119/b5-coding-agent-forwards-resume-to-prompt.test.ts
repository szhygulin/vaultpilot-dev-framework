// codingAgent forwards resumeContext to buildAgentSystemPrompt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 coding agent forwards resume to prompt", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/codingAgent.ts"), "utf8");
  assert.match(src, /resumeContext\s*:\s*input\.resumeContext|resumeContext\s*:\s*opts\.resumeContext/);
});
