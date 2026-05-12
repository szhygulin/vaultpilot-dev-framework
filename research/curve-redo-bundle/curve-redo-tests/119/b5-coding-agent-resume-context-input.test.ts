// CodingAgentInput accepts resumeContext.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b5 coding agent resume context input", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/codingAgent.ts"), "utf8");
  assert.match(src, /CodingAgentInput[\s\S]*?resumeContext\s*\?\s*:/);
});
