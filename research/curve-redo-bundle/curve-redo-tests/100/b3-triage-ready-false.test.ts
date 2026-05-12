// Pending → ready: false.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 triage ready false", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/triage.ts"), "utf8");
  assert.match(src, /ready\s*:\s*false[\s\S]*?pendingPostMortem|pendingPostMortem[\s\S]*?ready\s*:\s*false/);
});
