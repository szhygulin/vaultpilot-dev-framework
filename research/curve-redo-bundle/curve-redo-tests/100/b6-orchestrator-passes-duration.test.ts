// Orchestrator passes durationMs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b6 orchestrator passes duration", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /composeFailurePostMortem\([\s\S]*?durationMs/);
});
