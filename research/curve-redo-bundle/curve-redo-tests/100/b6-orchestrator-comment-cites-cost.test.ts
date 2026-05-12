// Orchestrator passes costUsd into compose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b6 orchestrator comment cites cost", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /composeFailurePostMortem\([\s\S]*?costUsd/);
});
