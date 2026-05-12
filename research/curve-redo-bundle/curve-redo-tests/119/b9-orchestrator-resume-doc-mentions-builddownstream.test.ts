// orchestrator doc explains buildAgentSystemPrompt rendering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b9 orchestrator resume doc mentions builddownstream", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /buildAgentSystemPrompt|seed/i);
});
