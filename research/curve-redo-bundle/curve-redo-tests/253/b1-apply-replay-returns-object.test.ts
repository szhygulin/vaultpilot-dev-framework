// PR #262 changed applyReplayRollback's return type from Promise<void> to
// Promise<ApplyReplayRollbackResult> (so the caller can capture originUrl).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("applyReplayRollback signature returns ApplyReplayRollbackResult, not void", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /applyReplayRollback[\s\S]*?:\s*Promise<\s*ApplyReplayRollbackResult\s*>/);
});
