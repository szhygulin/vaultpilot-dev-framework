// OrchestratorInput.budgetUsd.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 orch budget usd input", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /OrchestratorInput[\s\S]*?budgetUsd\s*\?\s*:\s*number/);
});
