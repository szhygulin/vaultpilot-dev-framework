// Skip in dry-run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 orch skip comment dryrun", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /nonCleanExit\s*&&\s*!opts\.dryRun|!opts\.dryRun\s*&&\s*nonCleanExit/);
});
