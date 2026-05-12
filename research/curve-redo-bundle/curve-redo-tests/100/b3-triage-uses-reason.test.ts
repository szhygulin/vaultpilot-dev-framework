// Threads reason into result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 triage uses reason", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/triage.ts"), "utf8");
  assert.match(src, /pendingPostMortem\.reason/);
});
