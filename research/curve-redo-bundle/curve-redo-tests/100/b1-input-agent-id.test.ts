// Input has agentId.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 input agent id", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/failurePostMortem.ts"), "utf8");
  assert.match(src, /FailurePostMortemInput[\s\S]*?agentId\s*:/);
});
